'''
Sysex configuration library for re.corder.

Copyright (c) 2021 Peter Brinkmann <peter.brinkmann@gmail.com>

BSD 3-Clause License
For information on usage and redistribution, and for a DISCLAIMER OF ALL
WARRANTIES, see the file LICENSE in this distribution.
'''

import logging
import queue

import rtmidi


USER_MODES = {
    1: 'Breath',
    2: 'Lip',
    3: 'Keyboard'
}

CONTROLLERS = {
    1: "Pressure",
    2: "AccX",
    3: "AccY",
    4: "AccZ"
}

CURVES = {
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
}

BUTTONS = {
    1: 'Octave up/down',
    2: 'Record',
    3: 'Stop',
    4: 'Play',
    5: 'Disconnect'
}


class Re_corderException(Exception):
  pass


class NoMatchingPortException(Re_corderException):
  pass


class NoSysexResponseException(Re_corderException):
  pass


class FailedRequestException(Re_corderException):
  def __init__(self, message, data=''):
    Exception.__init__(self, message)
    self.data = data


def re_corder_ports(port_name='re.corder'):
  midi_in = rtmidi.MidiIn()
  try:
    for i, p in enumerate(midi_in.get_ports()):
      if port_name in p:
        midi_out = rtmidi.MidiOut()
        midi_out.open_port(midi_out.get_ports().index(p))
        midi_in.open_port(i)
        midi_in.ignore_types(sysex=False)
        return (midi_in, midi_out)
  except:
    pass
  raise NoMatchingPortException(port_name)


class Re_corderReceiver(object):
  def handle_button(self, button, value):
    print('Button:', BUTTONS.get(button, button), value)

  def unhandled(self, data):
    print('Unhandled:', data.hex())

  def handle_midi(self, event, data=None):
    b = bytes(event[0])
    if (b[0] & 0xe0) == 0x80:
      print('MIDI:', b.hex())


class Re_corder(object):
  _PREFIX = bytes.fromhex('f0002f7f0001')
  _SUFFIX = bytes.fromhex('f7')

  def __init__(self, receiver=Re_corderReceiver(),
               port_name='re.corder', midi_ports=None):
    self.queue = queue.Queue()
    self.receiver = receiver
    self.midi_in, self.midi_out = midi_ports or re_corder_ports(port_name)
    self.midi_in.set_callback(self)

  def __call__(self, event, data=None):
    b = bytes(event[0])
    if b.startswith(self._PREFIX) and b.endswith(self._SUFFIX):
      payload = b[len(self._PREFIX):-len(self._SUFFIX)]
      if payload[0] == 0x01 or payload[0] == 0x02:
        self.queue.put(payload)
      elif payload[0] == 0x34:
        self.receiver.handle_button(payload[1], payload[2])
      else:
        self.receiver.unhandled(payload)
    else:
      self.receiver.handle_midi(event, data)

  def _run(self, cmd, data=bytes()):
    while not self.queue.empty():
      logging.warning(f'Dangling response in queue: {self.queue.get()}')
    cmd = bytes(cmd)
    self.midi_out.send_message(self._PREFIX + cmd + bytes(data) + self._SUFFIX)
    try:
      payload = self.queue.get(timeout=0.25)
    except queue.Empty as e:
      raise NoSysexResponseException() from e
    if payload[0] != 0x01:
      raise FailedRequestException('Try holding Record, perhaps?', payload)
    if payload[1:].startswith(cmd):
      return payload[len(cmd) + 1:]
    raise FailedRequestException(
        f'Unexpected response: {payload.hex()}', payload)

  def get_user_mode(self):
    return USER_MODES[self._run([0x22, 0x05], [])[0]]

  def get_midi_channel(self):
    return self._run([0x22, 0x03], [])[0]

  def get_sensitivity(self):
    _, _, hi, lo, _, v = self._run([0x31, 0x07], [0x01])
    return ((hi << 7) | lo, v)

  def get_controller_config(self):
    data = self._run([0x31, 0x01], [0x01])[1:]
    ctrls = {}
    for i in range(1, 5):
      ctrls[CONTROLLERS[i]] = (data[5 * i + 1], CURVES[data[5 * i + 3]])
    return ctrls

  def factory_reset(self):
    try:
      self._run([0x10])
      # A factory reset will close the Bluetooth connection; if self._run
      # doesn't throw a NoSysexResponseException, then something went wrong.
      raise FailedRequestException('Still connected after factory reset.')
    except NoSysexResponseException:
      pass

  def restore_default_settings(self):
    self._run([0x2f])

  # Admissible mode values are 'Breath', 'Lip', 'Keyboard'.
  def set_user_mode(self, mode):
    try:
      m = next(k for k, v in USER_MODES.items() if v == mode)
    except StopIteration:
      raise ValueError(f'Bad user mode: {mode}')
    self._run([0x21], [0x05, m])

  # ch is the 1-based MIDI channel (1-16).
  def set_midi_channel(self, ch):
    ch = int(ch)
    if ch < 1 or ch > 16:
      raise ValueError('Bad MIDI channel.')
    self._run([0x21], [0x03, ch])

  def set_sensitivity(self, threshold, velocity):
    threshold = int(threshold)
    velocity = int(velocity)
    if threshold < 601 or threshold > 0x3fff:
      raise ValueError('Bad threshold value.')
    if velocity < 0 or velocity > 0x7f:
      raise ValueError('Bad velocity value.')
    self._run(
        [0x30],
        [0x07, 0x02, 0x00, threshold >> 7, threshold & 0x7f, 0x01, velocity]
    )

  # ctrls is a dictonary that maps controller labels ('Pressure', 'AccX',
  # 'AccY', 'AccZ') to pairs of integers specifying the MIDI controller (0-127)
  # and curve ('None', 'Linear', 'Emb1', ..., 'Emb16').
  def set_controller_config(self, ctrls):
    data = bytearray.fromhex(
        '0100000000007f01007f007f02007f007f03007f007f04007f007f')
    for i in range(1, 5):
      ctrl, curve = ctrls[CONTROLLERS[i]]
      ctrl = int(ctrl)
      if ctrl < 0 or ctrl > 127:
        raise ValueError('Bad CC controller.')
      try:
        curve = next(k for k, v in CURVES.items() if v == curve)
      except StopIteration:
        raise ValueError(f'Bad curve: {curve}')
      data[5 * i + 3] = ctrl
      data[5 * i + 5] = curve
    self._run([0x30], data)

  # chart is a list of strings representing six-digit hex values xxyyzz, where
  # xx is a MIDI note value and yyzz represents an 11-bit number, yy < 7 | zz,
  # whose bits correspond to tone holes on the re.corder. E.g., '3f017f'
  # represents D#5.
  def set_fingering_chart(self, chart):
    if len(chart) < 1 or len(chart) > 62:
      raise ValueError('Bad fingering chart.')
    data = bytearray.fromhex('0000')
    for f in chart:
      b = bytes.fromhex(f)
      n = int.from_bytes(b, 'big')
      if len(b) != 3 or n & 0x7f0f7f != n:
        raise ValueError(f'Bad fingering: {f}')
      data.extend(b)
    self._run([0x30], data)
