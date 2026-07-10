import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// Wraps [AudioRecorder] for push-to-record voice notes. Records AAC/m4a to a
/// temp file and tracks elapsed time for the composer UI.
class VoiceRecorder extends ChangeNotifier {
  final AudioRecorder _recorder = AudioRecorder();

  bool _recording = false;
  bool get recording => _recording;

  bool _paused = false;
  bool get paused => _paused;

  Duration _elapsed = Duration.zero;
  Duration get elapsed => _elapsed;

  Timer? _timer;
  String? _path;

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _elapsed += const Duration(seconds: 1);
      notifyListeners();
    });
  }

  /// Returns false if microphone permission was denied.
  Future<bool> start() async {
    if (!await _recorder.hasPermission()) return false;
    final dir = await getTemporaryDirectory();
    _path = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 96000),
      path: _path!,
    );
    _recording = true;
    _paused = false;
    _elapsed = Duration.zero;
    _startTimer();
    notifyListeners();
    return true;
  }

  /// Pause the recording (keeps the file open; resume continues it).
  Future<void> pause() async {
    if (!_recording || _paused) return;
    try {
      await _recorder.pause();
    } catch (_) {
      return;
    }
    _timer?.cancel();
    _paused = true;
    notifyListeners();
  }

  /// Resume a paused recording.
  Future<void> resume() async {
    if (!_recording || !_paused) return;
    try {
      await _recorder.resume();
    } catch (_) {
      return;
    }
    _paused = false;
    _startTimer();
    notifyListeners();
  }

  /// Stops and returns the recorded file path (or null if too short / failed).
  Future<String?> stop() async {
    _timer?.cancel();
    final path = await _recorder.stop();
    _recording = false;
    _paused = false;
    notifyListeners();
    // Discard sub-second taps.
    if (_elapsed.inMilliseconds < 800) {
      await _safeDelete(path ?? _path);
      return null;
    }
    return path ?? _path;
  }

  Future<void> cancel() async {
    _timer?.cancel();
    final path = await _recorder.stop();
    _recording = false;
    _paused = false;
    notifyListeners();
    await _safeDelete(path ?? _path);
  }

  Future<void> _safeDelete(String? path) async {
    if (path == null) return;
    try {
      final f = File(path);
      if (await f.exists()) await f.delete();
    } catch (_) {/* best effort */}
  }

  @override
  void dispose() {
    _timer?.cancel();
    _recorder.dispose();
    super.dispose();
  }
}
