'use strict';

const to_bytes = s => new Uint8Array(s.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
const from_bytes = a => Array.prototype.map.call(a, b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');

const PREFIX = to_bytes('f0002f7f0001');
const SUFFIX = to_bytes('f7');

const USER_MODES = {
  1: 'Breath',
  2: 'Lip',
  3: 'Keyboard'
}

function poll_queue(queue, n_max, dt) {
  return new Promise((resolve, reject) => {
    var n = 0;
    const interval = setInterval(() => {
      n += 1;
      const item = queue.shift();
      if (item) {
        clearInterval(interval);
        resolve(item);
      } else if (n > n_max) {
        reject(new Error('Timeout'));
      }
    }, dt);
  });
}

class ReCorder {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    this.queue = [];
  
    input.onmidimessage = this.handle_midi.bind(this);
  }
  
  handle_midi(event) {
    const suffix_start = event.data.length - SUFFIX.length;
    if (PREFIX.every((v, i) => v === event.data[i]) &&
        SUFFIX.every((v, i) => v === event.data[i + suffix_start])) {
      const payload = event.data.slice(PREFIX.length, suffix_start);
      if (payload[0] === 0x01 || payload[0] === 0x02) {
        this.queue.push(payload);
      } else if (payload[0] === 0x34) {
        console.log('Button: ' + from_bytes(payload));
      } else {
        console.warn('Unexpected payload: ' + from_bytes(payload));
      }
    } else {
      console.log('MIDI event: ' + from_bytes(event.data));
    }
  }
  
  async _run(cmd, data=[]) {
    while (this.queue.shift()) {
      console.warn('Dangling payload!');
    }
    this.output.send([...PREFIX, ...cmd, ...data, ...SUFFIX]);
    const payload = await poll_queue(this.queue, 5, 50);
    if (payload[0] != 0x01) {
      throw new Error('Failed request --- try holding Record, perhaps? ' + from_bytes(payload));
    }
    if (!cmd.every((v, i) => v === payload[i + 1])) {
      throw new Error('Unexpected payload: ' + from_bytes(payload));
    }
    return payload.slice(cmd.length + 1);
  }
  
  async get_user_mode() {
    return USER_MODES[(await this._run([0x22, 0x05]))[0]]
  }
  
  async get_midi_channel() {
    return (await this._run([0x22, 0x03]))[0]
  }
}
