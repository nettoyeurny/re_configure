// UI functions of the re.configure web app.
//
// Copyright (c) 2023 Peter Brinkmann <peter.brinkmann@gmail.com>
//
// BSD 3-Clause License
// For information on usage and redistribution, and for a DISCLAIMER OF ALL
// WARRANTIES, see the file LICENSE in this distribution.
'use strict';

var re_corder = null;

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

const log_button = data => {
  console.log(`Re.corder button: ${data}`);
};

const log_note_event = e => {
  const data = e.data;
  if (!(data[0] & 0x60)) {
    console.log(`MIDI note event: ${to_hex(data)}`);
  }
};

const monitor_connection = () => {
  const label = document.getElementById('re_corder-state');
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
        midi_access, input_name, log_button, log_note_event)
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
  const text_area = document.getElementById('re_corder-config');
  get_re_corder_config(re_corder)
    .then(conf => text_area.value = JSON.stringify(conf, null, 2))
    .catch(alert);
};

const set_config = () => {
  const text_area = document.getElementById('re_corder-config');
  try {
    set_re_corder_config(re_corder, JSON.parse(text_area.value))
      .then(conf => text_area.value = JSON.stringify(conf, null, 2))
      .then(() => alert('Success!'))
      .catch(err => alert(`${err} --- Try holding Record, perhaps?`));
  } catch (err) {
    alert(err);
  }
};

const restore_default = () => {
  const text_area = document.getElementById('re_corder-config');
  re_corder.restore_default_settings()
    .then(() => get_re_corder_config(re_corder))
    .then(conf => text_area.value = JSON.stringify(conf, null, 2))
    .catch(err => alert(`${err} --- Try holding Record, perhaps?`));
};

const get_fingerings = () => {
  const text_area = document.getElementById('re_corder-fingerings');
  get_re_corder_fingerings(re_corder)
    .then(f => text_area.value = JSON.stringify(f, null, 2))
    .catch(alert);
};

const set_fingerings = () => {
  const text_area = document.getElementById('re_corder-fingerings');
  try {
    set_re_corder_fingerings(re_corder, JSON.parse(text_area.value))
      .then(() => alert('Success!'))
      .catch(alert);
  } catch (err) {
    alert(err);
  }
};

const get_keyboard_chart = () => {
  const text_area = document.getElementById('re_corder-keyboard');
  get_re_corder_keyboard(re_corder)
    .then(k => text_area.value = JSON.stringify(k, null, 2))
    .catch(alert);
};

const set_keyboard_chart = () => {
  const text_area = document.getElementById('re_corder-keyboard');
  try {
    set_re_corder_keyboard(re_corder, JSON.parse(text_area.value))
      .then(() => alert('Success!'))
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
  w.close();
};

const load_contents = id => {
  const text_area = document.getElementById(id);
  const opts = {
    types: TYPES
  };
  window.showOpenFilePicker(opts)
    .then(f => read_file(f[0]))
    .then(s => text_area.value = s)
    .catch(alert);
};

const save_contents = (id, fn) => {
  const text_area = document.getElementById(id);
  const opts = {
    suggestedName: fn,
    types: TYPES
  };
  window.showSaveFilePicker(opts)
    .then(f => write_file(f, text_area.value))
    .catch(alert);
};

window.addEventListener('load', () => {
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
