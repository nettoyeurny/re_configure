# re_configure

Command line configuration tools for
[Artinoise re.corder](http://www.artinoise.com/).

```
SYNOPSIS
  re_configure.py \
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
    Breath pressure threshold value, ranging from 601 to 16383. Default is 3000;
    the low setting in the re_corder app is 6000; the high setting is 1000.
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
    python3 python/re_configure.py -u Breath -m 5 -t 2000 -v 0 \
        -s configs/all_sensors_off.json -c configs/tin_whistle_d.json
```
