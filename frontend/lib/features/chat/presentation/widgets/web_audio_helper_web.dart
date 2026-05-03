// Web audio helper - uses dart:html AudioElement for playback
import 'dart:async';
import 'dart:html' as html;

class WebAudioHelper {
  html.AudioElement? _audio;
  final StreamController<double> _positionController = StreamController<double>.broadcast();
  final StreamController<Duration> _durationController = StreamController<Duration>.broadcast();
  final StreamController<bool> _playingController = StreamController<bool>.broadcast();

  Stream<double> get positionStream => _positionController.stream;
  Stream<Duration> get durationStream => _durationController.stream;
  Stream<bool> get playingStream => _playingController.stream;

  void init(String url) {
    _audio = html.AudioElement(url);
    _audio!.onLoadedMetadata.listen((_) {
      final dur = _audio!.duration;
      if (dur.isFinite) {
        _durationController.add(Duration(milliseconds: (dur * 1000).toInt()));
      }
    });
    _audio!.onTimeUpdate.listen((_) {
      final cur = _audio!.currentTime;
      final dur = _audio!.duration;
      if (dur.isFinite && dur > 0) {
        _positionController.add(cur / dur);
        _durationController.add(Duration(milliseconds: (dur * 1000).toInt()));
      }
    });
    _audio!.onEnded.listen((_) {
      _playingController.add(false);
      _positionController.add(0);
    });
  }

  void play() {
    _audio?.play();
    _playingController.add(true);
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

  void dispose() {
    _audio?.pause();
    _audio = null;
    _positionController.close();
    _durationController.close();
    _playingController.close();
  }
}

WebAudioHelper createAudioHelper() => WebAudioHelper();
