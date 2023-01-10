#!/usr/bin/env python -u

'''
re.corder configuration tool.

SYNOPSIS
  re_configure.py [-l] [-p port] [-f] [-r] [-u user_mode] [-m midi_channel] [-t threshold] [-v velocity] [-s settings_file] [-c chart_file] [-w] [-h]

DESCRIPTION
  This utility is an _unofficial_ tool for configuring the re.corder by
  Artinoise; use at your own risk. It changes the configuration of re.corder
  according to command line arguments. If no arguments are given, it will read
  and print the current configuration in json format.

  -l, --list
    List available MIDI ports.
  -p, --port
    Identifying substring of the name of the desired MIDI port; defaults to
    're.corder'.
  -f, --factory_reset
    Factory reset; closes the Bluetooth connection.
  -r, --restore
    Restore default settings.
  -u, --user_mode
    User mode; possible values are Breath, Lip, Keyboard.
  -m, --midi_channel
    MIDI channel 1-16.
  -n, --maintain_note
    Maintain note flag, 0 or 1
  -a, --smooth_acc
    Smooth accelerometer flag, 0 or 1
  -t, --threshold
    Breath pressure threshold value, ranging from 601 to 16383. Default is 3000;
    the low setting in the re_corder app is 6000; the high setting is 1000.
  -v, --velocity
    Note on velocity 0-127; 0 means dynamic velocity.
  -e, --easy_connect
    Set EasyConnect flag, 0 or 1
  -s, --settings
    Configuration file in json format.
  -c, --chart
    Loads fingering chart in json format.
  -d, --dump
    Dumps fingering chart in json format.
  -x, --export
    Exports the current config in json format.
  -w, --wait
    Wait for MIDI messages.
  -h, --help
    Print help message and exit.

  Command line arguments override settings in the settings file.

  Sample invocation:
    python python/re_configure.py -u Breath -m 5 -t 2000 -v 0 -s configs/all_sensors_off.json -c configs/tin_whistle_d.json

Copyright (c) 2021 Peter Brinkmann <peter.brinkmann@gmail.com>

BSD 3-Clause License
For information on usage and redistribution, and for a DISCLAIMER OF ALL
WARRANTIES, see the file LICENSE in this distribution.
'''

import getopt
import json
import sys
import time

import re_corder
import re_corder_charts


USER_MODE = 'user_mode'
MIDI_CHANNEL = 'midi_channel'
THRESHOLD = 'threshold'
VELOCITY = 'velocity'
CONTROLLERS = 'controllers'
EASY_CONNECT = 'easy_connect'
MAINTAIN_NOTE = 'maintain_note'
SMOOTH_ACC = 'smooth_acc'


def updated_config(config, new_config):
  ctrls = config.get(CONTROLLERS, {})
  ctrls.update(new_config.get(CONTROLLERS, {}))
  config.update(new_config)
  if ctrls:
    config[CONTROLLERS] = ctrls
  return config


def update_settings(r, new_conf={}, chart=None):
  conf = {}
  conf[USER_MODE] = r.get_user_mode()
  conf[MIDI_CHANNEL] = r.get_midi_channel()
  conf[THRESHOLD], conf[VELOCITY] = r.get_sensitivity()
  conf[CONTROLLERS] = r.get_controller_config()
  conf[EASY_CONNECT] = r.get_easy_connect_status()
  conf[MAINTAIN_NOTE], conf[SMOOTH_ACC] = r.get_smoothing()

  conf = updated_config(conf, new_conf)
  if USER_MODE in new_conf:
    print('Setting user mode.')
    r.set_user_mode(conf[USER_MODE])
  if MIDI_CHANNEL in new_conf:
    print('Setting MIDI channel.')
    r.set_midi_channel(conf[MIDI_CHANNEL])
  if THRESHOLD in new_conf or VELOCITY in new_conf:
    print('Setting sensitivity.')
    r.set_sensitivity(conf[THRESHOLD], conf[VELOCITY])
  if CONTROLLERS in new_conf:
    print('Setting aftertouch and controllers.')
    r.set_controller_config(conf[CONTROLLERS])
  if EASY_CONNECT in new_conf:
    print('Setting EasyConnect status.')
    r.set_easy_connect_status(conf[EASY_CONNECT])
  if MAINTAIN_NOTE in new_conf or SMOOTH_ACC in new_conf:
    print('Setting maintain note/smooth accelerometer status.')
    r.set_smoothing(conf[MAINTAIN_NOTE], conf[SMOOTH_ACC])

  if chart:
    print('Setting fingering chart.')
    r.set_fingering_chart(
        re_corder_charts.encode_chart(chart)
        if re_corder.USER_MODES[3] != conf[USER_MODE]
        else re_corder_charts.encode_keyboard_chart(chart))

  return conf


if __name__ == '__main__':
  try:
    args, extra = getopt.getopt(
        sys.argv[1:], 'a:x:n:p:u:m:t:v:s:c:d:e:wrfhl',
        [s + '=' for s in [USER_MODE, MIDI_CHANNEL, THRESHOLD, VELOCITY]] +
        ['port=', 'settings=', 'chart=', 'dump=', 'easy_connect=', 'export=',
         'wait', 'restore', 'factory_reset', 'help', 'list']
    )
    if extra:
      raise getopt.GetoptError('Extraneous args.')
  except getopt.GetoptError:
    print(__doc__, file=sys.stderr)
    sys.exit(1)

  cli_conf = {}
  json_conf = {}
  chart = None
  port_name = 're.corder'
  wait_for_messages = False
  restore = False
  factory_reset = False
  export_file = None
  chart_file = None
  for key, val in args:
    if key in ('-u', '--' + USER_MODE):
      cli_conf[USER_MODE] = val
    elif key in ('-m', '--' + MIDI_CHANNEL):
      cli_conf[MIDI_CHANNEL] = int(val, 10)
    elif key in ('-t', '--' + THRESHOLD):
      cli_conf[THRESHOLD] = int(val, 10)
    elif key in ('-v', '--' + VELOCITY):
      cli_conf[VELOCITY] = int(val, 10)
    elif key in ('-e', '--' + EASY_CONNECT):
      cli_conf[EASY_CONNECT] = bool(int(val, 10))
    elif key in ('-n', '--' + MAINTAIN_NOTE):
      cli_conf[MAINTAIN_NOTE] = bool(int(val, 10))
    elif key in ('-a', '--' + SMOOTH_ACC):
      cli_conf[SMOOTH_ACC] = int(val, 10)
    elif key in ('-p', '--port'):
      port_name = val
    elif key in ('-s', '--settings'):
      json_conf = json.load(open(val, 'r'))
    elif key in ('-c', '--chart'):
      chart = json.load(open(val, 'r'))
    elif key in ('-w', '--wait'):
      wait_for_messages = True
    elif key in ('-r', '--restore'):
      restore = True
    elif key in ('-f', '--factory_reset'):
      factory_reset = True
    elif key in ('-x', '--export'):
      export_file = val
    elif key in ('-d', '--dump'):
      chart_file = val
    elif key in ('-l', '--list'):
      for p in re_corder.get_ports():
        print(p)
      sys.exit(0)
    elif key in ('-h', '--help'):
      print(__doc__)
      sys.exit(0)

  r = re_corder.Re_corder(port_name=port_name)
  if factory_reset:
    print('Performing factory reset.')
    r.factory_reset()
    sys.exit(0)
  if restore:
    print('Restoring default settings.')
    r.restore_default_settings()
  conf = update_settings(r, updated_config(json_conf, cli_conf), chart)
  if export_file:
    with open(export_file, 'w') as f:
      json.dump(conf, f, sort_keys=True, indent=2)
  if chart_file:
    mode, chart = r.get_fingering_chart()
    with open(chart_file, 'w') as f:
      json.dump(re_corder_charts.decode_chart(chart) if mode != 'Keyboard'
                else re_corder_charts.decode_keyboard_chart(chart),
                f, indent=2)
  print(json.dumps(conf, sort_keys=True, indent=2))
  print('Battery state:', r.get_battery_state())
  while wait_for_messages:
    time.sleep(10)
