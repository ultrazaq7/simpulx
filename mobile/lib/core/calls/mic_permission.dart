import 'package:flutter/foundation.dart';
import 'package:record/record.dart';

/// Single source of truth for the microphone permission used by calls.
///
/// Uses the `record` plugin (already a dependency): `hasPermission()` prompts
/// the OS dialog when the status is still undetermined and returns the final
/// grant state.
///
/// Call this PROACTIVELY in the foreground (right after login, see
/// `_initPush`) so the prompt shows while the app is visible. If the very
/// first prompt is deferred to answer-time, it lands when the agent taps
/// Accept on a CallKit call from the LOCK SCREEN — where iOS cannot present a
/// permission alert, so `getUserMedia` throws and the call answers into dead
/// audio. Priming early makes the answer-time check a silent pass.
Future<bool> ensureMicPermission() async {
  try {
    return await AudioRecorder().hasPermission();
  } catch (e) {
    debugPrint('[mic] permission check failed: $e');
    return false;
  }
}
