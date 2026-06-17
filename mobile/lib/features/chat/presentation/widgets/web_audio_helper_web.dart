// Web audio helper - uses package:web HTMLAudioElement for playback
import 'dart:async';
import 'package:web/web.dart' as web;
import 'dart:js_interop';

class WebAudioHelper {
  web.HTMLAudioElement? _audio;
  final StreamController<double> _positionController =
      StreamController<double>.broadcast();
  final StreamController<Duration> _durationController =
      StreamController<Duration>.broadcast();
  final StreamController<bool> _playingController =
      StreamController<bool>.broadcast();
  final StreamController<void> _errorController =
      StreamController<void>.broadcast();

  Stream<double> get positionStream => _positionController.stream;
  Stream<Duration> get durationStream => _durationController.stream;
  Stream<bool> get playingStream => _playingController.stream;
  Stream<void> get errorStream => _errorController.stream;

  void init(String url) {
    _audio = web.HTMLAudioElement()
      ..src = url
      ..preload = 'metadata';
    _audio!.addEventListener('loadedmetadata', ((web.Event event) {
      _emitDuration();
    }).toJS);
    _audio!.addEventListener('durationchange', ((web.Event event) {
      _emitDuration();
    }).toJS);
    _audio!.addEventListener('canplay', ((web.Event event) {
      _emitDuration();
    }).toJS);
    _audio!.addEventListener('timeupdate', ((web.Event event) {
      final cur = _audio!.currentTime;
      final dur = _audio!.duration;
      if (dur.isFinite && dur > 0) {
        _positionController.add(cur / dur);
        _durationController.add(Duration(milliseconds: (dur * 1000).toInt()));
      }
    }).toJS);
    _audio!.addEventListener('ended', ((web.Event event) {
      _playingController.add(false);
      _positionController.add(0);
    }).toJS);
    _audio!.addEventListener('error', ((web.Event event) {
      _playingController.add(false);
      _errorController.add(null);
    }).toJS);
    _audio!.load();
  }

  Future<bool> play() async {
    final audio = _audio;
    if (audio == null) return false;
    try {
      await audio.play().toDart;
      _playingController.add(true);
      return true;
    } catch (_) {
      _playingController.add(false);
      _errorController.add(null);
      return false;
    }
  }

  void pause() {
    _audio?.pause();
    _playingController.add(false);
  }

  void seek(double fraction) {
    final dur = _audio?.duration ?? 0;
    if (dur.isFinite && dur > 0) {
      _audio!.currentTime = dur * fraction;
    }
  }

  Duration get currentTime {
    final t = _audio?.currentTime ?? 0;
    return Duration(milliseconds: (t * 1000).toInt());
  }

  void _emitDuration() {
    final dur = _audio?.duration ?? 0;
    if (dur.isFinite && dur > 0) {
      _durationController.add(Duration(milliseconds: (dur * 1000).toInt()));
    }
  }

  void dispose() {
    _audio?.pause();
    _audio = null;
    _positionController.close();
    _durationController.close();
    _playingController.close();
    _errorController.close();
  }
}

WebAudioHelper createAudioHelper() => WebAudioHelper();
