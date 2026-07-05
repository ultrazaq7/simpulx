import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/conversation.dart';
import '../../../../features/contacts/domain/entities/contact.dart';

/// Quick inbox filter, set by dashboard drill-through and the inbox itself.
class InboxFilter {
  const InboxFilter({
    this.interestLevel,
    this.status,
    this.stageName,
    this.assignment, // 'mine', 'unassigned', null
    this.campaignName,
    this.agentName,
    this.lostReason,
    this.unreadOnly = false,
    this.followUpOnly = false,
    this.unrepliedOnly = false,
  });

  final String? interestLevel;
  final String? status;
  final String? stageName;
  final String? assignment;
  final String? campaignName;
  final String? agentName;
  final String? lostReason;
  final bool unreadOnly;
  final bool followUpOnly;

  /// Customer sent the last message and the agent hasn't replied, while the 24h
  /// window is still open.
  final bool unrepliedOnly;

  static const all = InboxFilter();
  static const open = InboxFilter(status: 'open');
  static const hot = InboxFilter(interestLevel: 'hot');
  static const unread = InboxFilter(unreadOnly: true);
  static const followUp = InboxFilter(followUpOnly: true);
  static const unreplied = InboxFilter(unrepliedOnly: true);

  int get activeCount =>
      (interestLevel != null ? 1 : 0) +
      (status != null ? 1 : 0) +
      (stageName != null ? 1 : 0) +
      (assignment != null ? 1 : 0) +
      (campaignName != null ? 1 : 0) +
      (agentName != null ? 1 : 0) +
      (lostReason != null ? 1 : 0) +
      (unreadOnly ? 1 : 0) +
      (followUpOnly ? 1 : 0) +
      (unrepliedOnly ? 1 : 0);

  /// Human-readable summary of all active filters (for the "clear" chip).
  String get label {
    final parts = <String>[];
    if (interestLevel != null) parts.add(interestLevel!);
    if (status != null) parts.add(status!);
    if (stageName != null) parts.add(stageName!);
    if (assignment != null) parts.add(assignment!);
    if (campaignName != null) parts.add(campaignName!);
    if (agentName != null) parts.add(agentName!);
    if (lostReason != null) {
      final clean = lostReason!.replaceAll('lost_reason_', '').replaceAll('_', ' ');
      parts.add(clean);
    }
    if (unreadOnly) parts.add('Unread');
    if (followUpOnly) parts.add('Follow-up');
    if (unrepliedOnly) parts.add('Awaiting reply');
    return parts.join(', ');
  }

  bool matches(Conversation c, {String? myId}) {
    if (interestLevel != null && c.interestLevel != interestLevel) return false;
    if (status != null && c.status != status) return false;
    if (stageName != null) {
      if (stageName!.toLowerCase() == 'lost' && (c.stageName?.toLowerCase().startsWith('lost') ?? false)) {
        // match
      } else if (c.stageName != stageName) {
        return false;
      }
    }
    if (assignment == 'unassigned' && !c.isUnassigned) return false;
    if (assignment == 'mine' && c.assignedAgentId != myId) return false;
    if (campaignName != null && c.campaignName != campaignName) return false;
    if (agentName != null && c.agentName != agentName) return false;
    
    if (lostReason != null) {
      if (c.lostReason == null) return false;
      final f1 = lostReason!.replaceAll('lost_reason_', '');
      final f2 = c.lostReason!.replaceAll('lost_reason_', '');
      if (f1 != f2) return false;
    }
    if (unreadOnly && c.unreadCount == 0) return false;
    if (followUpOnly &&
        !((c.interestLevel == 'hot' || c.interestLevel == 'warm') &&
            c.unreadCount > 0)) {
      return false;
    }
    if (unrepliedOnly) {
      if (c.lastMessageDirection != 'contact') return false;
      final anchor = c.lastContactMessageAt ?? c.lastMessageAt;
      if (anchor == null) return false;
      if (DateTime.now().difference(anchor.toLocal()).inHours >= 24) {
        return false;
      }
    }
    return true;
  }

  bool matchesContact(Contact c, {String? myId}) {
    if (interestLevel != null && c.interestLevel != interestLevel) return false;
    
    // Status filter from dashboard (e.g., 'closed' for Lost Analysis card)
    if (status != null) {
      if (status == 'closed' && c.stageName != 'Lost' && c.stageName != 'Won') return false;
      if (status == 'open' && (c.stageName == 'Lost' || c.stageName == 'Won')) return false;
    }

    if (stageName != null) {
      if (stageName!.toLowerCase() == 'lost' && (c.stageName?.toLowerCase().startsWith('lost') ?? false)) {
        // match
      } else if (c.stageName != stageName) {
        return false;
      }
    }

    if (assignment == 'unassigned' && c.assignedAgentId != null) return false;
    if (assignment == 'mine' && c.assignedAgentId != myId) return false;
    if (campaignName != null && c.campaignName != campaignName) return false;
    if (agentName != null && c.agentName != agentName) return false;
    
    if (lostReason != null) {
      if (c.lostReason == null) return false;
      final f1 = lostReason!.replaceAll('lost_reason_', '');
      final f2 = c.lostReason!.replaceAll('lost_reason_', '');
      if (f1 != f2) return false;
    }

    return true;
  }

  InboxFilter copyWith({
    String? interestLevel,
    bool clearInterest = false,
    String? status,
    bool clearStatus = false,
    String? stageName,
    bool clearStage = false,
    String? assignment,
    bool clearAssignment = false,
    String? campaignName,
    bool clearCampaign = false,
    String? agentName,
    bool clearAgent = false,
    String? lostReason,
    bool clearLostReason = false,
    bool? unreadOnly,
    bool? followUpOnly,
    bool? unrepliedOnly,
  }) {
    return InboxFilter(
      interestLevel: clearInterest ? null : (interestLevel ?? this.interestLevel),
      status: clearStatus ? null : (status ?? this.status),
      stageName: clearStage ? null : (stageName ?? this.stageName),
      assignment: clearAssignment ? null : (assignment ?? this.assignment),
      campaignName: clearCampaign ? null : (campaignName ?? this.campaignName),
      agentName: clearAgent ? null : (agentName ?? this.agentName),
      lostReason: clearLostReason ? null : (lostReason ?? this.lostReason),
      unreadOnly: unreadOnly ?? this.unreadOnly,
      followUpOnly: followUpOnly ?? this.followUpOnly,
      unrepliedOnly: unrepliedOnly ?? this.unrepliedOnly,
    );
  }
}

class InboxFilterController extends Notifier<InboxFilter> {
  @override
  InboxFilter build() => InboxFilter.all;

  void set(InboxFilter filter) => state = filter;
  void clear() => state = InboxFilter.all;
}

final inboxFilterProvider =
    NotifierProvider<InboxFilterController, InboxFilter>(
  InboxFilterController.new,
);
