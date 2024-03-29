// Sysex configuration library for re.corder.
//
// Copyright (c) 2023 Peter Brinkmann <peter.brinkmann@gmail.com>
//
// BSD 3-Clause License
// For information on usage and redistribution, and for a DISCLAIMER OF ALL
// WARRANTIES, see the file LICENSE in this distribution.

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

const BUTTONS = {
  1: 'Octave up/down',
  2: 'Record',
  3: 'Stop',
  4: 'Play',
  5: 'Disconnect'
};

const from_hex = s => new Uint8Array(s.match(/.{1,2}/g)
  .map(byte => parseInt(byte, 16)));

const to_hex = a => Array.prototype.map.call(a, b => ('0' + (b & 0xFF)
  .toString(16)).slice(-2)).join('');

const find_key = (dict, val) => Object.keys(dict).find(k => dict[k] === val);

const PREFIX = from_hex('f0002f7f0001');
const SUFFIX = from_hex('f7');

class ReCorder {
  constructor(input, output, on_transport, on_midi) {
    this._input = input;
    this._output = output;
    this._on_transport = on_transport;
    this._on_midi = on_midi;
    this._queue = [];

    this._input.onmidimessage = this._handle_midi.bind(this);
  }

  async close() {
    await Promise.all([this._input.close(), this._output.close()]);
    this._input.onmidimessage = null;
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
        const resolve = this._queue.shift();
        if (resolve) {
          resolve(payload);
        } else {
          console.warn(`Unhandled payload: ${to_hex(payload)}`);
        }
      } else if (payload[0] === 0x34) {
        this._on_transport(payload.slice(1));
      } else {
        console.warn(`Unexpected payload: ${to_hex(payload)}`);
      }
    } else {
      this._on_midi(event);
    }
  }

  async _run(cmd, data = []) {
    const payload = await new Promise((resolve, reject) => {
      this._queue.push(resolve);
      this._output.send([...PREFIX, ...cmd, ...data, ...SUFFIX]);
      setTimeout(() => {
        const i = this._queue.indexOf(resolve);
        if (i >= 0) {
          this._queue.splice(i, 1);
          reject(new Error('Timeout'));
        }
      }, 250);
    });
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
    return {
      maintain_note: Boolean(data[2]),
      smooth_acc: data[4]
    };
  }

  async get_sensitivity() {
    const data = await this._run([0x31, 0x07], [0x01]);
    return {
      threshold: (data[2] << 7) | data[3],
      velocity: data[5]
    };
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

  async get_fingering_chart() {
    const data = await this._run([0x31, 0x00], [0x00]);
    return {
      mode: USER_MODES[data[0]],
      notes: Array.from({
        length: data.length / 3
      },
      (_, i) => data.slice(i * 3 + 1, i * 3 + 3 + 1))
    };
  }

  async get_battery_state() {
    const data = await this._run([0x3a], [0x02]);
    return (data[2] << 7) | data[3];
  }

  factory_reset() {
    return this._run([0x10])
      .then(() => {
        throw new Error('Still connected after reset?!?');
      })
      .catch(() => {});
  }

  restore_default_settings() {
    return this._run([0x2f]);
  }

  set_user_mode(mode) {
    const m = find_key(USER_MODES, mode);
    if (!m) {
      throw new Error(`Unknown user mode: ${mode}`);
    }
    return this._run([0x21], [0x05, m]);
  }

  set_midi_channel(ch) {
    if (ch < 1 || ch > 16) {
      throw new Error(`Invalid MIDI channel: ${ch}`);
    }
    return this._run([0x21], [0x03, ch]);
  }

  set_easy_connect_status(on) {
    const s = on ? 0 : 1;
    return this._run([0x21], [0x01, s]);
  }

  set_sensitivity(threshold, velocity) {
    if (threshold < 601 || threshold > 0x3fff) {
      throw new Error('Bad threshold value.');
    }
    if (velocity < 0 || velocity > 0x7f) {
      throw new Error('Bad velocity value.');
    }
    return this._run(
      [0x30],
      [0x07, 0x02, 0x00, threshold >> 7, threshold & 0x7f, 0x01, velocity]
    );
  }

  set_smoothing(maintain, smooth) {
    if (smooth < 0 || smooth > 4) {
      throw new Error('Bad accelerator smoothing value value.');
    }
    return this._run(
      [0x30],
      [0x08, 0x02, 0x03, maintain ? 1 : 0, 0x04, smooth]
    );
  }

  // The ctrls dict maps controller labels ('Pressure', 'AccX', 'AccY', 'AccZ')
  // to pairs of integers specifying the MIDI controller (0-127) and curve
  // ('None', 'Linear', 'Emb1', ..., 'Emb20'). The aftertouch setting is also
  // given by a curve.
  set_controller_config(ctrls) {
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
      data[10] = 0; // Aftertouch replaces pressure controller.
    }
    return this._run([0x30], data);
  }

  // chart is a list of three-byte arrays [xx, yy, zz], where xx is a MIDI note
  // value and yyzz represents an 11-bit number, yy << 7 | zz, whose bits
  // correspond to tone holes on the re.corder. E.g., [0x3f, 0x01, 0x7f]
  // represents D#5.
  set_fingering_chart(chart) {
    if (chart.length < 1 || chart.length > 62) {
      throw new Error('Bad fingering chart.');
    }
    for (let b of chart) {
      if (b.length != 3 || b[0] & 0x80 || b[1] & 0xf0 || b[2] & 0x80) {
        throw new Error(`Bad fingering: ${b}`);
      }
    }
    return this._run([0x30], [0x00, 0x00, ...chart.flat()]);
  }
}

export {
  USER_MODES,
  CONTROLLERS,
  CURVES,
  BUTTONS,
  ReCorder
};
