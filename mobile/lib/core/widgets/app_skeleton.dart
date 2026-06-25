import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

/// Shimmer skeleton placeholders for first-load states. Using shaped skeletons
/// (instead of a centered spinner) reduces perceived latency and avoids layout
/// shift, the way WhatsApp/Telegram/Slack load their lists and threads.
class _SkeletonColors {
  const _SkeletonColors(this.base, this.highlight, this.block);
  final Color base;
  final Color highlight;
  final Color block;

  factory _SkeletonColors.of(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark
        ? const _SkeletonColors(
            Color(0xFF202C33), Color(0xFF2A3942), Color(0xFF2A3942))
        : const _SkeletonColors(
            Color(0xFFEDEFF1), Color(0xFFF7F8FA), Color(0xFFE6E9EC));
  }
}

class _Block extends StatelessWidget {
  const _Block({
    required this.width,
    required this.height,
    this.radius = 6,
    this.shape = BoxShape.rectangle,
  });
  final double width;
  final double height;
  final double radius;
  final BoxShape shape;

  @override
  Widget build(BuildContext context) {
    final c = _SkeletonColors.of(context);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: c.block,
        shape: shape,
        borderRadius:
            shape == BoxShape.circle ? null : BorderRadius.circular(radius),
      ),
    );
  }
}

/// Skeleton for the inbox: rows shaped like [ConversationTile].
class ConversationListSkeleton extends StatelessWidget {
  const ConversationListSkeleton({super.key, this.rows = 9});
  final int rows;

  @override
  Widget build(BuildContext context) {
    final c = _SkeletonColors.of(context);
    return Shimmer.fromColors(
      baseColor: c.base,
      highlightColor: c.highlight,
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        padding: EdgeInsets.zero,
        itemCount: rows,
        itemBuilder: (_, _) => const _TileSkeleton(),
      ),
    );
  }
}

class _TileSkeleton extends StatelessWidget {
  const _TileSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _Block(width: 48, height: 48, shape: BoxShape.circle),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    Expanded(child: _Block(width: 0, height: 13)),
                    SizedBox(width: 40),
                    _Block(width: 34, height: 11),
                  ],
                ),
                const SizedBox(height: 10),
                const _Block(width: 220, height: 12),
                const SizedBox(height: 10),
                Row(
                  children: const [
                    _Block(width: 58, height: 18, radius: 999),
                    SizedBox(width: 6),
                    _Block(width: 78, height: 18, radius: 999),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Skeleton for a conversation thread: alternating left/right message bubbles.
class MessageThreadSkeleton extends StatelessWidget {
  const MessageThreadSkeleton({super.key, this.bubbles = 8});
  final int bubbles;

  @override
  Widget build(BuildContext context) {
    final c = _SkeletonColors.of(context);
    // Deterministic, natural-looking widths per row.
    const widths = [180.0, 240.0, 120.0, 200.0, 150.0, 230.0, 90.0, 210.0];
    return Shimmer.fromColors(
      baseColor: c.base,
      highlightColor: c.highlight,
      child: ListView.builder(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        itemCount: bubbles,
        itemBuilder: (_, i) {
          final mine = i.isOdd;
          final w = widths[i % widths.length];
          return Align(
            alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
            child: Container(
              width: w,
              height: 38,
              margin: const EdgeInsets.symmetric(vertical: 5),
              decoration: BoxDecoration(
                color: c.block,
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          );
        },
      ),
    );
  }
}
