#!/usr/bin/env python3 -u

'''
re.corder configuration tool.

SYNOPSIS
  python3 re_configure.py \
          [-p port] [-f] [-r] [-u user_mode] [-m midi_channel] [-t threshold] \
          [-v velocity] [-s settings_file] [-c chart_file] [-w]

DESCRIPTION
  This utility changes the configuration of re.corder according to the command
  line arguments. If no arguments are given, it will read and print the
  current configuration in json format.

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
  -t, --threshold
    Breath pressure threshold value. Default is 3000; the low setting in the
    re_corder app is 6000; the high setting is 1000.
  -v, --velocity
    Note on velocity 0-127; 0 means dynamic velocity.
  -s, --settings
    Configuration file in json format.
  -c, --chart
    Fingering chart in json format.
  -w, --wait
    Wait for MIDI messages.

  Command line arguments override settings in the settings file.

  Sample invocation:
    python3 re_configure.py -u Breath -m 5 -t 12000 -v 0 \
        -s settings.json -c tin_whistle_d.json

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


def updated_config(old_config, new_config):
  c = json.loads(json.dumps(old_config))
  n = json.loads(json.dumps(new_config))
  ctrls = c.get(CONTROLLERS, {})
  ctrls.update(n.get(CONTROLLERS, {}))
  c.update(n)
  if ctrls:
    c[CONTROLLERS] = { i : ctrls[str(i)] for i in range(1, 5)
                      if str(i) in ctrls}
  return c


def update_settings(r, new_conf = {}, chart = None):
  conf = {}
  conf[USER_MODE] = r.get_user_mode()
  conf[MIDI_CHANNEL] = r.get_midi_channel()
  conf[THRESHOLD], conf[VELOCITY] = r.get_sensitivity()
  conf[CONTROLLERS] = r.get_controller_config()

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
    print('Setting controllers.')
    r.set_controller_config(conf[CONTROLLERS])

  if chart:
    print('Setting fingering chart.')
    r.set_fingering_chart(
      re_corder_charts.encode_chart(chart)
      if re_corder.USER_MODES[3] != conf[USER_MODE]
      else re_corder_charts.encode_keyboard_chart(chart))

  return conf


if __name__ == '__main__':
  try:
    args, extra = getopt.getopt(sys.argv[1:], 'p:u:m:t:v:s:c:wrf',
                                [s + '=' for s in [USER_MODE, MIDI_CHANNEL, THRESHOLD, VELOCITY]] +
                                ['port=', 'settings=', 'chart=', 'wait', 'restore', 'factory_reset'])
    if extra:
      raise getopt.GetoptError('Extraneous args.')
  except getopt.GetoptError:
    print('usage: python re_configure.py [-p port] [-f] [-r] '
          '[-u user_mode] [-m midi_channel] [-t threshold] [-v velocity] '
          '[-s settings_file] [-c chart_file] [-w]')
    sys.exit(1)

  cli_conf = {}
  json_conf = {}
  chart = None
  port_name = 're.corder'
  wait_for_messages = False
  restore = False
  factory_reset = False
  for key, val in args:
    if key in ('-u', '--' + USER_MODE):
      cli_conf[USER_MODE] = val
    elif key in ('-m', '--' + MIDI_CHANNEL):
      cli_conf[MIDI_CHANNEL] = int(val, 10)
    elif key in ('-t', '--' + THRESHOLD):
      cli_conf[THRESHOLD] = int(val, 10)
    elif key in ('-v', '--' + VELOCITY):
      cli_conf[VELOCITY] = int(val, 10)
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

  r = re_corder.Re_corder(port_name = port_name)
  if factory_reset:
    print('Performing factory reset.')
    r.factory_reset()
    sys.exit(0)
  if restore:
    print('Restoring default settings.')
    r.restore_default_settings()
  conf = update_settings(r, updated_config(json_conf, cli_conf), chart)
  print(json.dumps(conf, sort_keys = True, indent = 2))

  while wait_for_messages:
    time.sleep(1)
