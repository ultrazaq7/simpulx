import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:simpulx/core/realtime/realtime_client.dart';
import 'package:simpulx/core/realtime/realtime_event.dart';
import 'package:simpulx/core/realtime/realtime_providers.dart';
import 'package:simpulx/features/calls/data/calls_remote_datasource.dart';
import 'package:simpulx/features/calls/domain/call_session.dart';
import 'package:simpulx/features/calls/presentation/call_controller.dart';
import 'package:simpulx/features/calls/presentation/webrtc_service.dart';

class _MockDs extends Mock implements CallsRemoteDataSource {}

class _MockRtc extends Mock implements WebRtcService {}

class _MockRealtime extends Mock implements RealtimeClient {}

RealtimeEvent _callEvent(Map<String, dynamic> data) => RealtimeEvent(
      id: 'e',
      type: 'call.updated',
      orgId: 'o',
      ts: DateTime.now(),
      data: data,
    );

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 10));

void main() {
  late _MockDs ds;
  late _MockRtc rtc;
  late _MockRealtime realtime;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer container;

  setUp(() {
    ds = _MockDs();
    rtc = _MockRtc();
    realtime = _MockRealtime();
    events = StreamController<RealtimeEvent>.broadcast();

    when(() => realtime.events).thenAnswer((_) => events.stream);
    when(rtc.createOffer).thenAnswer((_) async => 'OFFER_SDP');
    when(() => rtc.createAnswer(any())).thenAnswer((_) async => 'ANSWER_SDP');
    when(() => rtc.setRemoteAnswer(any())).thenAnswer((_) async {});
    when(() => rtc.setMuted(any())).thenAnswer((_) async {});
    when(rtc.dispose).thenAnswer((_) async {});
    when(() => ds.requestPermission(any())).thenAnswer(
        (_) async => const CallPermission(callId: 'call-1', granted: true));
    when(() => ds.initiate(
        callId: any(named: 'callId'),
        sdpOffer: any(named: 'sdpOffer'))).thenAnswer((_) async {});
    when(() => ds.accept(
        callId: any(named: 'callId'),
        sdpAnswer: any(named: 'sdpAnswer'))).thenAnswer((_) async {});
    when(() => ds.reject(any())).thenAnswer((_) async {});
    when(() => ds.end(any())).thenAnswer((_) async {});

    container = ProviderContainer(overrides: [
      callsDataSourceProvider.overrideWithValue(ds),
      webRtcServiceFactoryProvider.overrideWithValue(() => rtc),
      realtimeClientProvider.overrideWithValue(realtime),
    ]);
    addTearDown(container.dispose);
  });

  CallController boot() {
    final sub = container.listen(callControllerProvider, (_, _) {});
    addTearDown(sub.close);
    return container.read(callControllerProvider.notifier);
  }

  CallSession? sessionOf() => container.read(callControllerProvider);

  test('outbound with granted permission places an offer and rings', () async {
    final c = boot();
    await c.startOutbound(
        conversationId: 'cv1', contactName: 'Budi', contactPhone: '628');
    await _settle();

    verify(() => ds.requestPermission('cv1')).called(1);
    verify(rtc.createOffer).called(1);
    verify(() => ds.initiate(callId: 'call-1', sdpOffer: 'OFFER_SDP'))
        .called(1);
    expect(sessionOf()?.phase, CallPhase.ringing);
  });

  test('an SDP answer connects the outbound call', () async {
    final c = boot();
    await c.startOutbound(
        conversationId: 'cv1', contactName: 'Budi', contactPhone: '628');
    await _settle();

    events.add(_callEvent({
      'call_id': 'call-1',
      'call_status': 'connected',
      'sdp_answer': 'ANSWER_SDP',
    }));
    await _settle();

    verify(() => rtc.setRemoteAnswer('ANSWER_SDP')).called(1);
    expect(sessionOf()?.phase, CallPhase.connected);
  });

  test('inbound ring creates an incoming session that accept answers',
      () async {
    boot();
    events.add(_callEvent({
      'call_id': 'in-1',
      'conversation_id': 'cv2',
      'direction': 'inbound',
      'call_status': 'ringing',
      'sdp_offer': 'REMOTE_OFFER',
      'contact_name': 'Sari',
    }));
    await _settle();

    expect(sessionOf()?.phase, CallPhase.incoming);
    expect(sessionOf()?.inbound, isTrue);

    await container.read(callControllerProvider.notifier).acceptIncoming();
    await _settle();

    verify(() => rtc.createAnswer('REMOTE_OFFER')).called(1);
    verify(() => ds.accept(callId: 'in-1', sdpAnswer: 'ANSWER_SDP')).called(1);
    expect(sessionOf()?.phase, CallPhase.connected);
  });

  test('an ended event terminates the call', () async {
    final c = boot();
    await c.startOutbound(
        conversationId: 'cv1', contactName: 'Budi', contactPhone: '628');
    await _settle();

    events.add(_callEvent({
      'call_id': 'call-1',
      'call_status': 'ended',
      'end_reason': 'completed',
    }));
    await _settle();

    expect(sessionOf()?.phase, CallPhase.ended);
  });
}
