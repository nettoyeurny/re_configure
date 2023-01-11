# re\_configure

Unofficial command line configuration tools for
[Artinoise re.corder](http://www.artinoise.com/) --- use at your own risk!

The tools come in two flavors, Python and JavaScript. The
[JavaScript version](docs/re_corder.js)
requires no setup and works in any browser that supports the Web MIDI API. Just
click on the [link](https://nettoyeurny.github.io/re_configure/) and have fun!

## Python Setup

The Python version requires Python 3 (I have tried 3.6.3 and 3.9.6, but earlier
versions might work as well). Python version management can be a bit gnarly;
[pyenv](https://github.com/pyenv/pyenv) helps.

The only dependency besides Python 3 is RtMidi. Confusingly, there are multiple
libraries that offer RtMidi bindings for Python. We use
[`python-rtmidi`](https://pypi.org/project/python-rtmidi/):

    python -m pip install python-rtmidi

## Usage

Connect your re.corder to your computer and run `python/re_configure.py`. The
`-h` command line option will print a help message:

    python/re_configure.py -h

The configuration tool reads controller settings and fingering charts in json
format. For example, my preferred controller settings are in
`configs/pb_settings.json` and my preferred fingering chart is in
`configs/pb_english.json`.

## Fingering chart format

A fingering chart is a json file that contains a list of the form

    [
      ...
      [ "G5",  "*.***.oooo" ],
      [ "G#5", "*.**o.**@o" ],
      [ "A5",  "*.**o.oooo" ],
      ...
    ]

where each item specifies a note and a string representing a fingering to be
read from left to right (left thumb to right pinkie), where `o/*/@` stands for
an open/closed/partially closed hole, with optional dots for readability. In
addition, the letter `e` specifies a partially closed hole in the opposite way
(e.g., for left-handed fingerings).
