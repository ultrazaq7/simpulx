// Stub audio helper - non-web platforms (no-op)
import 'dart:async';

class WebAudioHelper {
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

  void init(String url) {}
  Future<bool> play() async => false;
  void pause() {}
  void seek(double fraction) {}
  Duration get currentTime => Duration.zero;

  void dispose() {
    _positionController.close();
    _durationController.close();
    _playingController.close();
    _errorController.close();
  }
}

WebAudioHelper createAudioHelper() => WebAudioHelper();
