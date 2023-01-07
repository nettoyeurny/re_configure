'use strict';

const to_bytes = s => new Uint8Array(s.match(/.{1,2}/g)
  .map(byte => parseInt(byte, 16)));
const from_bytes = a => Array.prototype.map.call(a, b => ('0' + (b & 0xFF)
  .toString(16)).slice(-2)).join('');

const PREFIX = to_bytes('f0002f7f0001');
const SUFFIX = to_bytes('f7');

const USER_MODES = {
  1: 'Breath',
  2: 'Lip',
  3: 'Keyboard'
}

const find_key = (dict, val) => Object.keys(dict).find(k => dict[k] === val);

const create_re_corder = async (midi_access, port_name) => {
  for (const input of midi_access.inputs.values()) {
    if (input.name.includes(port_name)) {
      for (const output of midi_access.outputs.values()) {
        if (output.name.includes(port_name)) {
          await Promise.all([input.open(), output.open()]);
          return new ReCorder(input, output);
        }
      }
    }
  }
  throw new Error('No matching port found');
}

class ReCorder {
  constructor(input, output) {
    this._input = input;
    this._output = output;
    this._queue = [];
  
    this._input.onmidimessage = this._handle_midi.bind(this);
  }
  
  close() {
    this._input.close();
    this._output.close();
  }

  _handle_midi(event) {
    const suffix_start = event.data.length - SUFFIX.length;
    if (PREFIX.every((v, i) => v === event.data[i]) &&
        SUFFIX.every((v, i) => v === event.data[i + suffix_start])) {
      const payload = event.data.slice(PREFIX.length, suffix_start);
      if (payload[0] === 0x01 || payload[0] === 0x02) {
        this._queue.push(payload);
      } else if (payload[0] === 0x34) {
        console.log(`Button: ${from_bytes(payload)}`);
      } else {
        console.warn(`Unexpected payload: ${from_bytes(payload)}`);
      }
    }
  }
  
  _poll(n_max = 5, dt = 50) {
    return new Promise((resolve, reject) => {
      var n = 0;
      const interval = setInterval(() => {
        n += 1;
        if (this._queue.length > 0) {
          clearInterval(interval);
          resolve(this._queue.shift());
        } else if (n > n_max) {
          clearInterval(interval);
          reject(new Error('Timeout'));
        }
      }, dt);
    });
  }

  async _run(cmd, data=[]) {
    while (this._queue.shift()) {
      console.warn('Dangling payload!');
    }
    this._output.send([...PREFIX, ...cmd, ...data, ...SUFFIX]);
    const payload = await this._poll();
    if (payload[0] != 0x01) {
      throw new Error(`Request failed: ${from_bytes(payload)}`);
    }
    if (!cmd.every((v, i) => v === payload[i + 1])) {
      throw new Error(`Unexpected payload: ${from_bytes(payload)}`);
    }
    return payload.slice(cmd.length + 1);
  }
  
  async get_user_mode() {
    return USER_MODES[(await this._run([0x22, 0x05]))[0]];
  }
  
  async get_midi_channel() {
    return (await this._run([0x22, 0x03]))[0];
  }

  async get_easy_connect_status() {
    return !(await this._run([0x22, 0x01]))[0];
  }

  async set_user_mode(mode) {
    const m = find_key(USER_MODES, mode);
    if (!m) {
      throw new Error(`Unknown user mode: ${mode}`);
    }
    await this._run([0x21], [0x05, m]);
  }

  async set_midi_channel(ch) {
    if (ch < 1 || ch > 16) {
      throw new Error(`Invalid MIDI channel: ${ch}`);
    }
    await this._run([0x21], [0x03, ch]);
  }

  async set_easy_connect_status(on) {
    const s = on ? 0 : 1;
    await this._run([0x21], [0x01, s]);
  }
}
