// UI functions of the re.configure web app.
//
// Copyright (c) 2023 Peter Brinkmann <peter.brinkmann@gmail.com>
//
// BSD 3-Clause License
// For information on usage and redistribution, and for a DISCLAIMER OF ALL
// WARRANTIES, see the file LICENSE in this distribution.

import { BUTTONS } from './re_corder.js';
import {
  create_re_corder,
  get_re_corder_config,
  set_re_corder_config,
  from_midi_note,
  get_re_corder_fingerings,
  set_re_corder_fingerings,
  get_re_corder_keyboard,
  set_re_corder_keyboard
} from './re_corder_utils.js';

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
    const label = get_by_id('re_corder-cc');
    label.innerText = `Controllers: ${Object.entries(cc_states).map(
        e => e[0] + ': ' + e[1]).join(', ')}`;
  }
};

const monitor_connection = () => {
  const label = get_by_id('re_corder-state');
  if (re_corder) {
    re_corder.get_battery_state()
      .then(b => label.innerText =
        `Battery: ${Math.max(Math.min(
          Math.round((b - 3200) / 8), 100), 0)}%`)
      .catch(() => label.innerText = 'Lost connection.');
  }
};

const get_config = () => {
  const text_area = get_by_id('txt-config');
  get_re_corder_config(re_corder)
    .then(conf => text_area.value = JSON.stringify(conf, null, 2))
    .catch(alert);
};

const set_config = () => {
  const text_area = get_by_id('txt-config');
  try {
    set_re_corder_config(re_corder, JSON.parse(text_area.value))
      .then(conf => {
        text_area.value = JSON.stringify(conf, null, 2);
        cc_states = {};
        get_by_id('re_corder-cc').innerText = '';
        flash_update('Success!');
      })
      .catch(err => alert(`${err} --- Try holding Record, perhaps?`));
  } catch (err) {
    alert(err);
  }
};

const restore_default = () => {
  const text_area = get_by_id('txt-config');
  re_corder.restore_default_settings()
    .then(() => get_re_corder_config(re_corder))
    .then(conf => text_area.value = JSON.stringify(conf, null, 2))
    .catch(err => alert(`${err} --- Try holding Record, perhaps?`));
};

const get_fingerings = () => {
  const text_area = get_by_id('txt-fingerings');
  get_re_corder_fingerings(re_corder)
    .then(f => text_area.value = JSON.stringify(f, null, 2))
    .catch(alert);
};

const set_fingerings = () => {
  const text_area = get_by_id('txt-fingerings');
  try {
    set_re_corder_fingerings(re_corder, JSON.parse(text_area.value))
      .then(() => flash_update('Success!'))
      .catch(alert);
  } catch (err) {
    alert(err);
  }
};

const get_keyboard_chart = () => {
  const text_area = get_by_id('txt-keyboard_chart');
  get_re_corder_keyboard(re_corder)
    .then(k => text_area.value = JSON.stringify(k, null, 2))
    .catch(alert);
};

const set_keyboard_chart = () => {
  const text_area = get_by_id('txt-keyboard_chart');
  try {
    set_re_corder_keyboard(re_corder, JSON.parse(text_area.value))
      .then(() => flash_update('Success!'))
      .catch(alert);
  } catch (err) {
    alert(err);
  }
};

const add_option = (selector, name) => {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  selector.appendChild(option);
}

const midi_setup = midi_access => {
  const selector = document.querySelector('#input-port-selector');
  const none_option = document.createElement('option');
  none_option.textContent = 'None';
  selector.appendChild(none_option);
  midi_access.inputs.forEach(input => {
    add_option(selector, input.name);
  });
  midi_access.addEventListener('statechange', e => {
    if (e.port.type !== 'input') {
      return;
    }
    const connected = e.port.state === 'connected';
    for (let i = 0; i < selector.options.length; ++i) {
      if (selector.options[i].value === e.port.name) {
        if (!connected) {
          selector.remove(i);
        }
        return;
      }
    }
    if (connected) {
      add_option(selector, e.port.name);
    }
  });

  var monitor_interval = null;
  selector.addEventListener('change', event => {
    (re_corder ? re_corder.close() : Promise.resolve())
      .then(() => {
        enable_elements(RE_CORDER_TAG, false);
        clearInterval(monitor_interval);
        cc_states = {};
        get_by_id('re_corder-state').innerText = '';
        get_by_id('re_corder-cc').innerText = '';
        re_corder = null;
        if (event.target.selectedIndex) {
          const input_name = event.target.value;
          create_re_corder(
            midi_access, input_name, show_button, show_midi_event)
            .then(r => r.get_midi_channel()
              .then(() => {
                re_corder = r;
                enable_elements(RE_CORDER_TAG, true);
                monitor_interval = setInterval(
                  () => monitor_connection(), 1000);
              })
              .catch(err => {
                r.close();
                alert(`${err} --- Wrong port, perhaps?`);
              }))
            .catch(alert);
        }
      });
  });
};

const install_handlers = (label, getter, setter) => {
  get_by_id(`btn_get_${label}`).addEventListener('click', getter);
  get_by_id(`btn_set_${label}`).addEventListener('click', setter);
  get_by_id(`btn_open_${label}`).addEventListener('click',
    () => load_contents(`txt-${label}`));
  get_by_id(`btn_save_${label}`).addEventListener('click',
    () => save_contents(`txt-${label}`, `${label}.json`));
}

window.addEventListener('load', () => {
  get_by_id('btn_restore_default').addEventListener('click', restore_default);
  install_handlers('config', get_config, set_config);
  install_handlers('fingerings', get_fingerings, set_fingerings);
  install_handlers('keyboard_chart', get_keyboard_chart, set_keyboard_chart);
  enable_elements(FILE_ACCESS_TAG, window.showOpenFilePicker);
  enable_elements(RE_CORDER_TAG, false);
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
