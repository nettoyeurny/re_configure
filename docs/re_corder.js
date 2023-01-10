// Sysex configuration library for re.corder.
//
// Copyright (c) 2023 Peter Brinkmann <peter.brinkmann@gmail.com>
//
// BSD 3-Clause License
// For information on usage and redistribution, and for a DISCLAIMER OF ALL
// WARRANTIES, see the file LICENSE in this distribution.
'use strict';

const from_hex = s => new Uint8Array(s.match(/.{1,2}/g)
  .map(byte => parseInt(byte, 16)));

const to_hex = a => Array.prototype.map.call(a, b => ('0' + (b & 0xFF)
  .toString(16)).slice(-2)).join('');

const find_key = (dict, val) => Object.keys(dict).find(k => dict[k] === val);

const PREFIX = from_hex('f0002f7f0001');
const SUFFIX = from_hex('f7');

const USER_MODES = {
  1: 'Breath',
  2: 'Lip',
  3: 'Keyboard'
};

const CONTROLLERS = {
    1: 'Pressure',
    2: 'AccX',
    3: 'AccY',
    4: 'AccZ'
};

const CURVES = {
    0: 'None',
    1: 'Linear',
    2: 'Emb1',
    3: 'Emb2',
    4: 'Emb3',
    5: 'Emb4',
    6: 'Emb5',
    7: 'Emb6',
    8: 'Emb7',
    9: 'Emb8',
    10: 'Emb9',
    11: 'Emb10',
    12: 'Emb11',
    13: 'Emb12',
    14: 'Emb13',
    15: 'Emb14',
    16: 'Emb15',
    17: 'Emb16',
    18: 'Emb17',
    19: 'Emb18',
    20: 'Emb19',
    21: 'Emb20'
};

const create_re_corder =
    async (midi_access, port_name, on_re_corder_button, on_midi_msg) => {
  for (const input of midi_access.inputs.values()) {
    if (input.name.includes(port_name)) {
      for (const output of midi_access.outputs.values()) {
        if (output.name.includes(port_name)) {
          await Promise.all([input.open(), output.open()]);
          return new ReCorder(input, output, on_re_corder_button, on_midi_msg);
        }
      }
    }
  }
  throw new Error('No matching port found');
}

class ReCorder {
  constructor(input, output, on_re_corder_button, on_midi_msg) {
    this._input = input;
    this._output = output;
    this._on_re_corder_button = on_re_corder_button;
    this._on_midi_msg = on_midi_msg;
    this._queue = [];

    this._input.onmidimessage = this._handle_midi.bind(this);
  }

  close() {
    this._input.onmidimessage = null;
    this._input.close();
    this._output.close();
  }

  toString() {
    return `ReCorder(${this._input.name}, ${this._output.name})`;
  }

  _handle_midi(event) {
    const suffix_start = event.data.length - SUFFIX.length;
    if (PREFIX.every((v, i) => v === event.data[i]) &&
        SUFFIX.every((v, i) => v === event.data[i + suffix_start])) {
      const payload = event.data.slice(PREFIX.length, suffix_start);
      if (payload[0] === 0x01 || payload[0] === 0x02) {
        this._queue.push(payload);
      } else if (payload[0] === 0x34) {
        this._on_re_corder_button(payload.slice(1));
      } else {
        console.warn(`Unexpected payload: ${to_hex(payload)}`);
      }
    } else {
      this._on_midi_msg(event);
    }
  }

  _poll(n_max = 10, dt = 25) {
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
      throw new Error(`Request failed: ${to_hex(payload)}`);
    }
    if (!cmd.every((v, i) => v === payload[i + 1])) {
      throw new Error(`Unexpected payload: ${to_hex(payload)}`);
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

  async get_smoothing() {
    const data = await this._run([0x31, 0x08], [0x01]);
    return { maintain_note: Boolean(data[2]), smooth_acc: data[4] };
  }

  async get_sensitivity() {
    const data = await this._run([0x31, 0x07], [0x01]);
    return { threshold: (data[2] << 7) | data[3], velocity: data[5] };
  }

  async get_controller_config() {
    const data = await this._run([0x31, 0x01], [0x01]);
    const ctrls = {};
    ctrls.aftertouch = CURVES[data[4]];
    for (let i = 1; i < 5; ++i) {
      ctrls[CONTROLLERS[i]] = {
        ctrl: data[5 * i + 2],
        curve: CURVES[data[5 * i + 4]]
      };
    }
    return ctrls;
  }

  async get_battery_state() {
    const data = await this._run([0x3a], [0x02]);
    return (data[2] << 7) | data[3];
  }

  async factory_reset() {
    this._run([0x10])
      .then(() => {
        throw new Error('Still connected after reset?!?');
      })
      .catch(() => {});
  }

  async restore_default_settings() {
    await this._run([0x2f]);
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

  async set_sensitivity(threshold, velocity) {
    if (threshold < 601 || threshold > 0x3fff) {
      throw new Error('Bad threshold value.');
    }
    if (velocity < 0 || velocity > 0x7f) {
      throw new Error('Bad velocity value.');
    }
    await this._run(
        [0x30],
        [0x07, 0x02, 0x00, threshold >> 7, threshold & 0x7f, 0x01, velocity]
    )
  }

  async set_smoothing(maintain, smooth) {
    if (smooth < 0 || smooth > 4) {
      throw new Error('Bad accelerator smoothing value value.');
    }
    await this._run(
        [0x30],
        [0x08, 0x02, 0x03, maintain ? 1 : 0, 0x04, smooth]
    );
  }

  // The ctrls dict maps controller labels ('Pressure', 'AccX', 'AccY', 'AccZ')
  // to pairs of integers specifying the MIDI controller (0-127) and curve
  // ('None', 'Linear', 'Emb1', ..., 'Emb20'). The aftertouch setting is also
  // given by a curve.
  async set_controller_config(ctrls) {
    const data = from_hex(
      '0100000000007f01007f007f02007f007f03007f007f04007f007f');
    for (let i = 1; i < 5; ++i) {
      const ctrl = ctrls[CONTROLLERS[i]].ctrl;
      const curve = find_key(CURVES, ctrls[CONTROLLERS[i]].curve);
      if (ctrl < 0 || ctrl > 127) {
        throw new Error('Bad CC controller.');
      }
      data[5 * i + 3] = ctrl;
      data[5 * i + 5] = curve;
    }
    const a = find_key(CURVES, ctrls.aftertouch);
    if (a) {
      data[5] = a;
      data[10] = 0;  // Aftertouch replaces pressure controller.
    }
    await this._run([0x30], data);
  }

  // chart is a list of strings representing six-digit hex values xxyyzz, where
  // xx is a MIDI note value and yyzz represents an 11-bit number, yy << 7 | zz,
  // whose bits correspond to tone holes on the re.corder. E.g., '3f017f'
  // represents D#5.
  async set_fingering_chart(chart) {
    if (chart.length < 1 || chart.length > 62) {
      throw new Error('Bad fingering chart.');
    }
    const data = new Uint8Array(2 + 3 * chart.length);
    data.set(from_hex('0000'), 0);
    for (let i = 0; i < chart.length; ++i) {
      const b = from_hex(chart[i]);
      if (b.length != 3 || b[0] & 0x80 || b[1] & 0xf0 || b[2] & 0x80) {
        throw new Error(`Bad fingering: ${chart[i]}`);
      }
      data.set(b, 2 + 3 * i);
    }
    await this._run([0x30], data);
  }
}

const get_re_corder_config = async r => {
  const user_mode = await r.get_user_mode();
  const midi_channel = await r.get_midi_channel();
  const easy_connect = await r.get_easy_connect_status();
  const smoothing = await r.get_smoothing();
  const sensitivity = await r.get_sensitivity();
  const controllers = await r.get_controller_config();
  return {
    user_mode: user_mode,
    midi_channel: midi_channel,
    threshold: sensitivity.threshold,
    velocity: sensitivity.velocity,
    controllers: controllers,
    easy_connect: easy_connect,
    maintain_note: smoothing.maintain_note,
    smooth_acc: smoothing.smooth_acc
  };
}

const deep_update = (obj1, obj2) => {
  for (const key in obj2) {
    if (obj2[key] instanceof Object) {
      deep_update(obj1[key], obj2[key]);
    } else {
      obj1[key] = obj2[key];
    }
  }
}

const set_re_corder_config = async (r, new_conf) => {
  const conf = await get_re_corder_config(r);
  const old_user_mode = conf.user_mode;
  const old_midi_channel = conf.midi_channel;
  deep_update(conf, new_conf);
  if (conf.user_mode !== old_user_mode) {
    await r.set_user_mode(conf.user_mode);
  }
  if (conf.midi_channel !== old_midi_channel) {
    await r.set_midi_channel(conf.midi_channel);
  }
  await r.set_easy_connect_status(conf.easy_connect);
  await r.set_sensitivity(conf.threshold, conf.velocity);
  await r.set_smoothing(conf.maintain_note, conf.smooth_acc);
  await r.set_controller_config(conf.controllers);
  return conf;
}

const NOTES = [
    'C', 'C', 'C#', 'Db', 'D', 'D', 'D#', 'Eb', 'E', 'E', 'F', 'F',
    'F#', 'Gb', 'G', 'G', 'G#', 'Ab', 'A', 'A', 'A#', 'Bb', 'B', 'B'
];

const RECORDER_ENCODING = [
// Full    Partial
  [0x0003, 0x0002],   // Left thumb
  [0x0004, 0x0004],   // Left index finger
  [0x0008, 0x0008],   // Left middle finger
  [0x0010, 0x0010],   // Left ring finger
  [0x0020, 0x0020],   // Right index finger
  [0x0040, 0x0040],   // Right middle finger
  [0x0300, 0x0100],   // Right ring finger
  [0x0c00, 0x0400]    // Right pinkie
]

const to_midi_note = note => {
  const octave = +note.substring(note.length - 1);
  const index = NOTES.indexOf(note.substring(0, note.length - 1));
  if (octave < 0 || octave > 10 || index < 0) {
    throw new Error(`Bad note: ${note}`);
  }
  return octave * 12 + (index >> 1);
}

const encode_fingering = (note, fingering) => {
  const s = fingering.replace(/\./g, '');
  if (RECORDER_ENCODING.length < s.length) {
    throw new Error(`Bad fingering: ${fingering}`);
  }
  var f = 0;
  for (let i = 0; i < s.length; ++i) {
    const c = s[i];
    const bits = RECORDER_ENCODING[i];
    if (c === '*') {
      f |= bits[0];
    } else if (c === '@' && bits[0] !== bits[1]) {
      f |= bits[1];
    } else if (c === 'e' && bits[0] !== bits[1]) {
      f |= (bits[0] ^ bits[1]);
    } else if (c !== 'o') {
      throw new Error(`Bad fingering: ${fingering}`);
    }
  }
  return to_hex([to_midi_note(note), f >> 8, f & 0x7f]);
}

const set_re_corder_fingerings = async (r, fingerings) => {
  const user_mode = await r.get_user_mode();
  if (user_mode === 'Keyboard') {
    throw new Error(`Can't set fingering in user mode ${user_mode}.`);
  }
  const chart = fingerings.map(a => encode_fingering(a[0], a[1]));
  await r.set_fingering_chart(chart);
}

const set_re_corder_keyboard = async (r, notes) => {
  if (notes.length !== 9) {
    throw new Error(`Bad keyboard chart (expected nine notes): ${notes}`);
  }
  const user_mode = await r.get_user_mode();
  if (user_mode !== 'Keyboard') {
    throw new Error(`Can't set keyboard chart in user mode ${user_mode}.`);
  }
  const chart = notes.map((note, i) => {
    const bit = 2 << i;
    return to_hex([to_midi_note(note), bit >> 7, bit & 0x7f]);
  });
  await r.set_fingering_chart(chart);
}
