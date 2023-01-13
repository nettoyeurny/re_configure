// UI functions of the re.configure web app.
//
// Copyright (c) 2023 Peter Brinkmann <peter.brinkmann@gmail.com>
//
// BSD 3-Clause License
// For information on usage and redistribution, and for a DISCLAIMER OF ALL
// WARRANTIES, see the file LICENSE in this distribution.
'use strict';

import {
  BUTTONS,
  create_re_corder,
  get_re_corder_config,
  set_re_corder_config,
  from_midi_note,
  get_re_corder_fingerings,
  set_re_corder_fingerings,
  get_re_corder_keyboard,
  set_re_corder_keyboard
} from './re_corder.js';

var re_corder = null;
var cc_states = {};
var flash_timeout = null;

const RE_CORDER_TAG = 're_corder';
const FILE_ACCESS_TAG = 'file_access';

const TYPES = [{
  description: 'JSON File',
  accept: {
    'application/json': ['.json']
  }
}];

const enable_elements = (tag, enabled) => {
  const elts = document.getElementsByClassName(tag);
  for (const elt of elts) {
    elt.disabled = !enabled;
  }
};

const get_by_id = document.getElementById.bind(document);

const flash_update = s => {
  const label = get_by_id('flash_label');
  label.innerText= s;
  const dialog = get_by_id('flash_dialog');
  dialog.show();
  clearTimeout(flash_timeout);
  flash_timeout = setTimeout(() => dialog.close(), 1200);
};

const show_button = data => {
  const val = data[1] < 0x40 ? data[1] : (data[1] - 0x80);
  flash_update(`Re.corder button: (${BUTTONS[data[0]]}, ${val})`);
};

const three_digits = n => ('00' + n).substr(-3);

const update_controllers = () => {
  const label = get_by_id('re_corder-cc');
  label.innerText = Object.keys(cc_states).length
    ? `Controllers: ${Object.entries(cc_states).map(
      e => e[0] + ': ' + e[1]).join(', ')}`
    : '';
};

const show_midi_event = e => {
  const data = e.data;
  if ((data[0] & 0x60) == 0x00) {
    flash_update(`MIDI Note ${(data[0] & 0x10) ? 'On' : 'Off'}: ${
      from_midi_note(data[1])}, ${three_digits(data[2])}`);
  } else {
    if ((data[0] & 0xf0) == 0xb0) {
      cc_states[`cc-${three_digits(data[1])}`] = three_digits(data[2]);
    } else if ((data[0] & 0xf0) == 0xd0) {
      cc_states['touch'] = three_digits(data[1]);
    }
    update_controllers();
  }
};

const monitor_connection = () => {
  const label = get_by_id('re_corder-state');
  if (re_corder) {
    re_corder.get_battery_state()
      .then(b => label.innerText =
        `Battery: ${Math.max(Math.min(
          Math.round((b - 3200) / 8), 100), 0)}%`)
      .catch(() => label.innerText = 'No connection.');
  } else {
    label.innerText = 'No connection.';
  }
};

const midi_setup = midi_access => {
  const selector = document.querySelector('#input-port-selector');
  const none_option = document.createElement('option');
  none_option.textContent = 'None';
  selector.appendChild(none_option);
  midi_access.inputs.forEach(input => {
    const option = document.createElement('option');
    option.value = input.name;
    option.textContent = input.name;
    selector.appendChild(option);
  });
  selector.addEventListener('change', event => {
    if (re_corder) {
      enable_elements(RE_CORDER_TAG, false);
      re_corder.close();
      re_corder = null;
    }
    if (event.target.selectedIndex > 0) {
      const input_name = event.target.value;
      create_re_corder(
        midi_access, input_name, show_button, show_midi_event)
        .then(r => {
          re_corder = r;
          return r.get_midi_channel();
        })
        .then(() => enable_elements(RE_CORDER_TAG, true))
        .catch(err => alert(`${err} --- Wrong port, perhaps?`));
    }
  });
};

const get_config = () => {
  const text_area = get_by_id('re_corder-config');
  get_re_corder_config(re_corder)
    .then(conf => text_area.value = JSON.stringify(conf, null, 2))
    .catch(alert);
};

const set_config = () => {
  const text_area = get_by_id('re_corder-config');
  try {
    set_re_corder_config(re_corder, JSON.parse(text_area.value))
      .then(conf => {
        text_area.value = JSON.stringify(conf, null, 2);
        cc_states = {};
        update_controllers();
        flash_update('Success!');
      })
      .catch(err => alert(`${err} --- Try holding Record, perhaps?`));
  } catch (err) {
    alert(err);
  }
};

const restore_default = () => {
  const text_area = get_by_id('re_corder-config');
  re_corder.restore_default_settings()
    .then(() => get_re_corder_config(re_corder))
    .then(conf => text_area.value = JSON.stringify(conf, null, 2))
    .catch(err => alert(`${err} --- Try holding Record, perhaps?`));
};

const get_fingerings = () => {
  const text_area = get_by_id('re_corder-fingerings');
  get_re_corder_fingerings(re_corder)
    .then(f => text_area.value = JSON.stringify(f, null, 2))
    .catch(alert);
};

const set_fingerings = () => {
  const text_area = get_by_id('re_corder-fingerings');
  try {
    set_re_corder_fingerings(re_corder, JSON.parse(text_area.value))
      .then(() => flash_update('Success!'))
      .catch(alert);
  } catch (err) {
    alert(err);
  }
};

const get_keyboard_chart = () => {
  const text_area = get_by_id('re_corder-keyboard_chart');
  get_re_corder_keyboard(re_corder)
    .then(k => text_area.value = JSON.stringify(k, null, 2))
    .catch(alert);
};

const set_keyboard_chart = () => {
  const text_area = get_by_id('re_corder-keyboard_chart');
  try {
    set_re_corder_keyboard(re_corder, JSON.parse(text_area.value))
      .then(() => flash_update('Success!'))
      .catch(alert);
  } catch (err) {
    alert(err);
  }
};

const read_file = async h => {
  const f = await h.getFile();
  return f.text();
};

const write_file = async (f, s) => {
  const w = await f.createWritable();
  await w.write(s);
  return w.close();
};

const load_contents = id => {
  const text_area = get_by_id(id);
  const opts = {
    types: TYPES
  };
  window.showOpenFilePicker(opts)
    .then(f => read_file(f[0]))
    .then(s => text_area.value = s)
    .catch(alert);
};

const save_contents = (id, fn) => {
  const text_area = get_by_id(id);
  const opts = {
    suggestedName: fn,
    types: TYPES
  };
  window.showSaveFilePicker(opts)
    .then(f => write_file(f, text_area.value))
    .catch(alert);
};

window.addEventListener('load', () => {
  get_by_id('btn_get_config').onclick = get_config;
  get_by_id('btn_set_config').onclick = set_config;
  get_by_id('btn_restore_default').onclick = restore_default;
  get_by_id('btn_open_config').onclick =
    () => load_contents('re_corder-config');
  get_by_id('btn_save_config').onclick =
    () => save_contents('re_corder-config', 'config.json');

  get_by_id('btn_get_fingerings').onclick = get_fingerings;
  get_by_id('btn_set_fingerings').onclick = set_fingerings;
  get_by_id('btn_open_fingerings').onclick =
    () => load_contents('re_corder-fingerings');
  get_by_id('btn_save_fingerings').onclick =
    () => save_contents('re_corder-fingerings', 'fingerings.json');

  get_by_id('btn_get_keyboard_chart').onclick = get_keyboard_chart;
  get_by_id('btn_set_keyboard_chart').onclick = set_keyboard_chart;
  get_by_id('btn_open_keyboard_chart').onclick =
    () => load_contents('re_corder-keyboard_chart');
  get_by_id('btn_save_keyboard_chart').onclick =
    () => save_contents('re_corder-keyboard_chart', 'keyboard_chart.json');

  enable_elements(FILE_ACCESS_TAG, window.showOpenFilePicker);
  enable_elements(RE_CORDER_TAG, false);
  setInterval(() => monitor_connection(), 1000);
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({
      sysex: true,
      software: true
    })
      .then(midi_access => midi_setup(midi_access))
      .catch(() => alert('Failed to get MIDI access!'));
  } else {
    alert('This browser does not support Web MIDI!');
  }
});
