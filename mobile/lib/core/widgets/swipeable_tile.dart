import 'package:flutter/material.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import '../utils/animation_constants.dart';
import '../utils/haptics.dart';

/// Swipeable list tile with WhatsApp-style actions.
class SwipeableConversationTile extends StatefulWidget {
  const SwipeableConversationTile({
    super.key,
    required this.child,
    this.onSwipeLeft,
    this.onSwipeRight,
    this.leftActions = const [],
    this.rightActions = const [],
    this.onDismissed,
    this.confirmDismiss,
  });

  final Widget child;
  final VoidCallback? onSwipeLeft;
  final VoidCallback? onSwipeRight;
  final List<SwipeAction> leftActions;
  final List<SwipeAction> rightActions;
  final VoidCallback? onDismissed;
  final Future<bool> Function()? confirmDismiss;

  @override
  State<SwipeableConversationTile> createState() =>
      _SwipeableConversationTileState();
}

class _SwipeableConversationTileState extends State<SwipeableConversationTile>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  double _dragExtent = 0;
  static const double _actionWidth = 80;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: AnimDurations.medium,
      vsync: this,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    setState(() {
      _dragExtent += details.delta.dx;
      // Limit drag extent
      if (_dragExtent > 0 && widget.rightActions.isEmpty) {
        _dragExtent = 0;
      } else if (_dragExtent < 0 && widget.leftActions.isEmpty) {
        _dragExtent = 0;
      } else {
        _dragExtent = _dragExtent.clamp(-_actionWidth * widget.leftActions.length.toDouble(),
                                       _actionWidth * widget.rightActions.length.toDouble());
      }
    });
  }

  void _handleDragEnd(DragEndDetails details) {
    final threshold = _actionWidth * 0.5;

    if (_dragExtent > threshold && widget.onSwipeRight != null) {
      Haptics.selection;
      widget.onSwipeRight!();
    } else if (_dragExtent < -threshold && widget.onSwipeLeft != null) {
      Haptics.selection;
      widget.onSwipeLeft!();
    }

    // Animate back to center
    _controller.value = _dragExtent.abs() / (_actionWidth * 2);
    _controller.animateTo(
      0,
      duration: AnimDurations.medium,
      curve: AnimCurves.bouncy,
    );
    setState(() => _dragExtent = 0);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragUpdate: _handleDragUpdate,
      onHorizontalDragEnd: _handleDragEnd,
      child: Stack(
        children: [
          // Background actions - right side (swipe left reveals)
          if (widget.rightActions.isNotEmpty)
            Positioned.fill(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: widget.rightActions.map((action) {
                  return Container(
                    width: _actionWidth,
                    color: Colors.red.shade400,
                    child: InkWell(
                      onTap: () {
                        Haptics.medium;
                        action.onTap?.call();
                      },
                      child: Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(action.icon, color: Colors.white, size: 24),
                            const SizedBox(height: 4),
                            Text(
                              action.label,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          // Background actions - left side (swipe right reveals)
          if (widget.leftActions.isNotEmpty)
            Positioned.fill(
              child: Row(
                children: widget.leftActions.map((action) {
                  return Container(
                    width: _actionWidth,
                    color: Colors.green.shade400,
                    child: InkWell(
                      onTap: () {
                        Haptics.medium;
                        action.onTap?.call();
                      },
                      child: Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(action.icon, color: Colors.white, size: 24),
                            const SizedBox(height: 4),
                            Text(
                              action.label,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          // Foreground content
          Transform.translate(
            offset: Offset(_dragExtent, 0),
            child: widget.child,
          ),
        ],
      ),
    );
  }
}

/// Configuration for a swipe action
class SwipeAction {
  const SwipeAction({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
}

/// Flutter Slidable-based swipeable tile for more advanced use cases
class PremiumSlidableTile extends StatelessWidget {
  const PremiumSlidableTile({
    super.key,
    required this.child,
    this.onDelete,
    this.onArchive,
    this.onMute,
    this.onPin,
    this.onEdit,
  });

  final Widget child;
  final VoidCallback? onDelete;
  final VoidCallback? onArchive;
  final VoidCallback? onMute;
  final VoidCallback? onPin;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    return Slidable(
      key: const Key('premium_slidable'),
      startActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: 0.25,
        children: [
          if (onMute != null)
            SlidableAction(
              onPressed: (_) {
                Haptics.medium;
                onMute!();
              },
              backgroundColor: Colors.amber.shade600,
              foregroundColor: Colors.white,
              icon: Icons.volume_off_rounded,
              label: 'Mute',
              borderRadius: const BorderRadius.horizontal(
                left: Radius.circular(16),
              ),
            ),
          if (onPin != null)
            SlidableAction(
              onPressed: (_) {
                Haptics.medium;
                onPin!();
              },
              backgroundColor: Colors.blue.shade600,
              foregroundColor: Colors.white,
              icon: Icons.push_pin_rounded,
              label: 'Pin',
            ),
        ],
      ),
      endActionPane: ActionPane(
        motion: const BehindMotion(),
        extentRatio: 0.25,
        children: [
          if (onArchive != null)
            SlidableAction(
              onPressed: (_) {
                Haptics.heavy;
                onArchive!();
              },
              backgroundColor: Colors.blue.shade400,
              foregroundColor: Colors.white,
              icon: Icons.archive_rounded,
              label: 'Archive',
            ),
          if (onDelete != null)
            SlidableAction(
              onPressed: (_) {
                Haptics.heavy;
                onDelete!();
              },
              backgroundColor: Colors.red.shade500,
              foregroundColor: Colors.white,
              icon: Icons.delete_rounded,
              label: 'Delete',
              borderRadius: const BorderRadius.horizontal(
                right: Radius.circular(16),
              ),
            ),
        ],
      ),
      child: child,
    );
  }
}
