import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/conversation.dart';

/// Quick inbox filter, set by dashboard drill-through and the inbox itself.
class InboxFilter {
  const InboxFilter({
    this.interestLevel,
    this.status,
    this.stageName,
    this.assignment, // 'mine', 'unassigned', null
    this.campaignName,
    this.agentName,
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
      (unreadOnly ? 1 : 0) +
      (followUpOnly ? 1 : 0) +
      (unrepliedOnly ? 1 : 0);

  bool matches(Conversation c, {String? myId}) {
    if (interestLevel != null && c.interestLevel != interestLevel) return false;
    if (status != null && c.status != status) return false;
    if (stageName != null && c.stageName != stageName) return false;
    if (assignment == 'unassigned' && !c.isUnassigned) return false;
    if (assignment == 'mine' && c.assignedAgentId != myId) return false;
    if (campaignName != null && c.campaignName != campaignName) return false;
    if (agentName != null && c.agentName != agentName) return false;
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
