#!/usr/bin/env python3 -u

'''
Sysex monitoring tool.

1. Have your computer advertise as 're.corder L'.
2. Connect your computer to the app.
3. Connect your re.corder to the computer.
4. Run this script.

Copyright (c) 2021 Peter Brinkmann <peter.brinkmann@gmail.com>

BSD 3-Clause License
For information on usage and redistribution, and for a DISCLAIMER OF ALL
WARRANTIES, see the file LICENSE in this distribution.
'''

import functools
import getopt
import sys
import time

import re_corder


class SysexShark(object):
  def __init__(self, phone_name, log_all=False, device=None, app=None):
    self.log_all = log_all
    self.device = device or re_corder.re_corder_ports()
    self.app = app or re_corder.re_corder_ports(phone_name)
    self.device[0].set_callback(
        functools.partial(self._receive, 'Dev:', self.app[1]))
    self.app[0].set_callback(
        functools.partial(self._receive, 'App:', self.device[1]))

  def _receive(self, tag, port, event, data=None):
    b = bytes(event[0])
    port.send_message(b)
    if self.log_all or b[0] == 0xf0:
      print(tag, b.hex())


if __name__ == '__main__':
  args, extra = getopt.getopt(sys.argv[1:], 'p:a')

  phone_name = 'Pixel'
  log_all = False
  for k, v in args:
    if k == '-p':
      phone_name = v
    elif k == '-a':
      log_all = True

  shark = SysexShark(phone_name, log_all)
  while True:
    time.sleep(1)
