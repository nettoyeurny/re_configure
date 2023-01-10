#!/usr/bin/env python -u

'''
Custom fingering charts for re.corder.

A fingering chart is a list of the form
[
  ...
  [ "G5",  "*.***.oooo" ],
  [ "G#5", "*.**o.**@o" ],
  [ "A5",  "*.**o.oooo" ],
  ...
]
where each item specifies a note and a string representing a fingering to be
read from left to right (left thumb to right pinkie), where o/*/@ stands for an
open/closed/partially closed hole, with optional dots for readability. In
addition, the letter e specifies a partially closed hole in the opposite way
(e.g., for left-handed fingerings).

When run as a main routine, it reads name-sysex pairs from stdin, decodes the
sysex message, and writes a human-readable chart to {name}.json. The -k command
line option emits keyboard charts rather than recorder fingering charts.

Typical input lines:
baroque f0002f7f00013000003c0f7f3d077f3e037f3f017f40007f410f3f41033f42035f42075f420f5f43001f44006f44016f44036f44002f45000f46001746003746007747000747001b48000b48001c48003349000c4900034900344a00084a00044a00304b03784b037c4b03704b03604c007e4c007c4c00784c007b4d033e4d033c4d033c4e005e4e003e4f001e4f031e50002e50004e51000e52036e52034e520f4e520f5652035653006e530006540066540026540036540076550c36560336560f36f7
kb_c_maj f0002f7f00013000003c00023e00044000084100104300204500404701004802004a0400f7

Copyright (c) 2021 Peter Brinkmann <peter.brinkmann@gmail.com>

BSD 3-Clause License
For information on usage and redistribution, and for a DISCLAIMER OF ALL
WARRANTIES, see the file LICENSE in this distribution.
'''

import getopt
import json
import sys


NOTES = (
    'C', 'C', 'C#', 'Db', 'D', 'D', 'D#', 'Eb', 'E', 'E', 'F', 'F',
    'F#', 'Gb', 'G', 'G', 'G#', 'Ab', 'A', 'A', 'A#', 'Bb', 'B', 'B',
)

RECORDER_ENCODING = (
    #    Full    Partial
    (0x0003, 0x0002),   # Left thumb
    (0x0004, 0x0004),   # Left index finger
    (0x0008, 0x0008),   # Left middle finger
    (0x0010, 0x0010),   # Left ring finger
    (0x0020, 0x0020),   # Right index finger
    (0x0040, 0x0040),   # Right middle finger
    (0x0300, 0x0100),   # Right ring finger
    (0x0c00, 0x0400),   # Right pinkie
)

KEYBOARD_ENCODING = (
    0x0002,   # Leftmost hole (_not_ thumb)
    0x0004,
    0x0008,
    0x0010,
    0x0020,
    0x0040,
    0x0100,
    0x0200,
    0x0400,
)


def to_midi_note(note):
  return 12 * int(note[-1], 10) + NOTES.index(note[:-1]) // 2


def from_midi_note(note):
  return NOTES[(note % 12) * 2] + str(note // 12)


def decode_fingering(fingering):
  f = int(fingering, 16)
  s = ''
  for full, partial in RECORDER_ENCODING:
    if full == 0x04 or full == 0x20:
      s += '.'
    if f & full == full:
      s += '*'
    elif f & partial:
      s += '@'
    elif f & full:
      s += 'e'
    else:
      s += 'o'
  note = f >> 16
  return (NOTES[(note % 12) * 2] + str(note // 12), s)


def decode_chart(chart):
  return [decode_fingering(f) for f in sorted(chart)]


def encode_fingering(note, fingering):
  s = fingering.replace('.', '')
  if len(RECORDER_ENCODING) < len(s):
    raise ValueError(f'Bad fingering: {fingering}')
  f = 0
  for c, bits in zip(s, RECORDER_ENCODING):
    if c == '*':
      f |= bits[0]
    elif c == '@' and bits[0] != bits[1]:
      f |= bits[1]
    elif c == 'e' and bits[0] != bits[1]:
      f |= (bits[0] ^ bits[1])
    elif c != 'o':
      raise ValueError(f'Bad fingering: {fingering}')
  return bytes((to_midi_note(note), f >> 8, f & 0x7f)).hex()


def encode_chart(chart):
  return sorted([encode_fingering(n, f) for n, f in chart])


def decode_keyboard_chart(chart):
  d = {int(s[2:], 16): from_midi_note(int(s[:2], 16)) for s in chart}
  if len(d) != len(KEYBOARD_ENCODING):
    raise ValueError(f'Bad keyboard chart: {chart}')
  return [d[e] for e in KEYBOARD_ENCODING]


def encode_keyboard_chart(notes):
  if len(notes) != len(KEYBOARD_ENCODING):
    raise ValueError(f'Bad keyboard chart: {notes}')
  return [bytes([to_midi_note(note), bit >> 8, bit & 0x7f]).hex()
          for note, bit in zip(notes, KEYBOARD_ENCODING)]


if __name__ == '__main__':
  args, _ = getopt.getopt(sys.argv[1:], 'h', 'k')
  keyboard = False
  for k, _ in args:
    if k == '-k':
      keyboard = True
    elif k == '-h':
      print(__doc__)
      sys.exit(0)

  PREFIX = 'f0002f7f0001300000'
  for line in sys.stdin:
    name, chart = line.split(' ')
    chart = chart[len(PREFIX):-3]
    if len(chart) % 6 != 0:
      raise ValueError(f'Bad fingering chart: {chart}')
    chart = [chart[i:i + 6] for i in range(0, len(chart), 6)]
    decoded = decode_keyboard_chart(chart) if keyboard else decode_chart(chart)
    json.dump(decoded, open(name + '.json', 'w'), sort_keys=True, indent=2)
