// Stub audio helper - non-web platforms (no-op)
import 'dart:async';

class WebAudioHelper {
  final StreamController<double> _positionController = StreamController<double>.broadcast();
  final StreamController<Duration> _durationController = StreamController<Duration>.broadcast();
  final StreamController<bool> _playingController = StreamController<bool>.broadcast();

  Stream<double> get positionStream => _positionController.stream;
  Stream<Duration> get durationStream => _durationController.stream;
  Stream<bool> get playingStream => _playingController.stream;

  void init(String url) {}
  void play() {}
  void pause() {}
  void seek(double fraction) {}
  Duration get currentTime => Duration.zero;

  void dispose() {
    _positionController.close();
    _durationController.close();
    _playingController.close();
  }
}

WebAudioHelper createAudioHelper() => WebAudioHelper();
