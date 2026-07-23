import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../../app/theme/app_colors.dart';

/// Channel branding shared across the app (chat list, contacts, details), the
/// mobile mirror of the web `ChannelIcon` / `channelLabel`. One source of truth
/// so a WhatsApp / Messenger / Instagram lead reads and looks the same
/// everywhere instead of leaking raw lowercase keys like "whatsapp".
class ChannelMeta {
  const ChannelMeta({
    required this.label,
    required this.icon,
    required this.color,
    this.gradient,
  });

  final String label;
  final IconData icon;
  final Color color;

  /// Only Instagram carries a gradient tile (matches web); null = solid color.
  final Gradient? gradient;
}

/// Proper display casing for a channel key ("whatsapp" -> "WhatsApp"). Mirrors
/// web `channelLabel` exactly, including the "Direct" fallback for empty input.
String channelLabel(String? channel) {
  if (channel == null || channel.trim().isEmpty) return 'Direct';
  const map = {
    'whatsapp': 'WhatsApp',
    'messenger': 'Messenger',
    'instagram': 'Instagram',
    'telegram': 'Telegram',
    'facebook': 'Facebook',
    'sms': 'SMS',
    'line': 'LINE',
    'viber': 'Viber',
    'email': 'Email',
    'webchat': 'Web chat',
    'testing': 'Testing',
  };
  final k = channel.toLowerCase();
  return map[k] ?? (channel[0].toUpperCase() + channel.substring(1));
}

const _instagramGradient = LinearGradient(
  begin: Alignment.bottomLeft,
  end: Alignment.topRight,
  colors: [Color(0xFFF58529), Color(0xFFDD2A7B), Color(0xFF8134AF), Color(0xFF515BD4)],
  stops: [0.0, 0.45, 0.75, 1.0],
);

/// Branding for a channel key. Glyphs mirror the web `ChannelIcon` (Material
/// equivalents of the lucide icons): a chat bubble for WhatsApp, the Facebook
/// mark for Messenger, a camera for Instagram, and so on.
ChannelMeta channelMeta(String? channel) {
  // Real brand marks (FontAwesome) so a WhatsApp lead shows the WhatsApp logo,
  // not a generic chat bubble.
  // FontAwesome 11 wraps its glyphs in FaIconData; `.data` unwraps the plain
  // IconData the standard Icon widget renders (const-unfriendly, hence no const).
  switch (channel?.toLowerCase()) {
    case 'whatsapp':
      return ChannelMeta(
          label: 'WhatsApp',
          icon: FontAwesomeIcons.whatsapp.data,
          color: AppColors.whatsapp);
    case 'messenger':
      return ChannelMeta(
          label: 'Messenger',
          icon: FontAwesomeIcons.facebookMessenger.data,
          color: AppColors.messenger);
    case 'instagram':
      return ChannelMeta(
          label: 'Instagram',
          icon: FontAwesomeIcons.instagram.data,
          color: AppColors.instagram,
          gradient: _instagramGradient);
    case 'telegram':
      return ChannelMeta(
          label: 'Telegram',
          icon: FontAwesomeIcons.telegram.data,
          color: AppColors.telegram);
    case 'viber':
      return ChannelMeta(
          label: 'Viber',
          icon: FontAwesomeIcons.viber.data,
          color: AppColors.viber);
    case 'sms':
      return ChannelMeta(
          label: 'SMS',
          icon: FontAwesomeIcons.commentSms.data,
          color: const Color(0xFF6B7280));
    case 'line':
      return ChannelMeta(
          label: 'LINE',
          icon: FontAwesomeIcons.line.data,
          color: const Color(0xFF06C755));
    case 'testing':
      return const ChannelMeta(
          label: 'Testing', icon: Icons.science_rounded, color: AppColors.brandGreenDark);
    default:
      return ChannelMeta(
          label: channelLabel(channel),
          icon: Icons.chat_bubble_rounded,
          color: AppColors.forChannel(channel));
  }
}

/// Rounded brand tile with the channel glyph, the mobile mirror of web's
/// `<ChannelIcon>`. Used wherever a channel needs a recognizable logo.
class ChannelLogo extends StatelessWidget {
  const ChannelLogo({super.key, required this.channel, this.size = 32, this.radius = 9});

  final String? channel;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final m = channelMeta(channel);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: m.gradient == null ? m.color : null,
        gradient: m.gradient,
        borderRadius: BorderRadius.circular(radius),
      ),
      alignment: Alignment.center,
      child: Icon(m.icon, size: size * 0.56, color: Colors.white),
    );
  }
}

/// Small channel logo pinned to an avatar corner (chat list rows): a brand-color
/// disc with the white glyph, ringed so it reads on any avatar behind it.
class ChannelCornerBadge extends StatelessWidget {
  const ChannelCornerBadge({super.key, required this.channel, this.size = 18});

  final String? channel;
  final double size;

  @override
  Widget build(BuildContext context) {
    final m = channelMeta(channel);
    final ringColor = Theme.of(context).brightness == Brightness.dark
        ? AppColors.darkBackground
        : Colors.white;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: m.gradient == null ? m.color : null,
        gradient: m.gradient,
        shape: BoxShape.circle,
        border: Border.all(color: ringColor, width: 2),
      ),
      alignment: Alignment.center,
      child: Icon(m.icon, size: size * 0.52, color: Colors.white),
    );
  }
}
