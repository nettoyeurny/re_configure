// Configuration utilities for re.corder.
//
// Copyright (c) 2023 Peter Brinkmann <peter.brinkmann@gmail.com>
//
// BSD 3-Clause License
// For information on usage and redistribution, and for a DISCLAIMER OF ALL
// WARRANTIES, see the file LICENSE in this distribution.

import { ReCorder } from './re_corder.js';

const create_re_corder = async (midi_access, port, on_transport, on_midi) => {
  for (const input of midi_access.inputs.values()) {
    if (input.name.includes(port)) {
      for (const output of midi_access.outputs.values()) {
        if (output.name.includes(port)) {
          await Promise.all([input.open(), output.open()]);
          return new ReCorder(
            input, output, on_transport, on_midi);
        }
      }
    }
  }
  throw new Error('No matching port found');
};

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
};

const deep_update = (obj1, obj2) => {
  for (const key in obj2) {
    if (obj2[key] instanceof Object) {
      deep_update(obj1[key], obj2[key]);
    } else {
      obj1[key] = obj2[key];
    }
  }
};

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
};

const NOTES = [
  'C', 'C', 'C#', 'Db', 'D', 'D', 'D#', 'Eb', 'E', 'E', 'F', 'F',
  'F#', 'Gb', 'G', 'G', 'G#', 'Ab', 'A', 'A', 'A#', 'Bb', 'B', 'B'
];

const RECORDER_ENCODING = [
  [0x0003, 0x0002], // Left thumb
  [0x0004, 0x0004], // Left index finger
  [0x0008, 0x0008], // Left middle finger
  [0x0010, 0x0010], // Left ring finger
  [0x0020, 0x0020], // Right index finger
  [0x0040, 0x0040], // Right middle finger
  [0x0300, 0x0100], // Right ring finger
  [0x0c00, 0x0400], // Right pinkie
];

const to_midi_note = note => {
  const octave = +note.substring(note.length - 1);
  const index = NOTES.indexOf(note.substring(0, note.length - 1));
  if (octave < 0 || octave > 10 || index < 0) {
    throw new Error(`Bad note: ${note}`);
  }
  return octave * 12 + (index >> 1);
};

const from_midi_note = note => {
  return NOTES[(note % 12) * 2] + Math.floor(note / 12);
};

const decode_fingering = fingering => {
  const f = (fingering[1] << 8) | fingering[2];
  var s = '';
  for (let enc of RECORDER_ENCODING) {
    const full = enc[0];
    const partial = enc[1];
    if (full === 0x04 || full === 0x20) {
      s += '.';
    }
    if ((f & full) === full) {
      s += '*';
    } else if (f & partial) {
      s += '@';
    } else if (f & full) {
      s += 'e';
    } else {
      s += 'o';
    }
  }
  const note = fingering[0];
  return [from_midi_note(note), s];
};

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
  return [to_midi_note(note), f >> 8, f & 0x7f];
};

const get_re_corder_fingerings = async (r) => {
  const f = await r.get_fingering_chart();
  if (f.mode === 'Keyboard') {
    throw new Error(`Can't get fingering chart in user mode ${f.mode}.`);
  }
  return f.notes.map(n => decode_fingering(n));
};

const set_re_corder_fingerings = async (r, fingerings) => {
  const user_mode = await r.get_user_mode();
  if (user_mode === 'Keyboard') {
    throw new Error(`Can't set fingering chart in user mode ${user_mode}.`);
  }
  const chart = fingerings.map(a => encode_fingering(a[0], a[1]));
  return r.set_fingering_chart(chart);
};

const get_re_corder_keyboard = async (r) => {
  const f = await r.get_fingering_chart();
  if (f.mode !== 'Keyboard') {
    throw new Error(`Can't get keyboard chart in user mode ${f.mode}.`);
  }
  return f.notes.map(n => from_midi_note(n[0]));
};

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
    return [to_midi_note(note), bit >> 7, bit & 0x7f];
  });
  return r.set_fingering_chart(chart);
};

export {
  create_re_corder,
  get_re_corder_config,
  set_re_corder_config,
  get_re_corder_fingerings,
  set_re_corder_fingerings,
  get_re_corder_keyboard,
  set_re_corder_keyboard,
  from_midi_note,
  to_midi_note
};
