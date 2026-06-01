import 'package:flutter/material.dart';

/// Canonical source-channel enum codes stored in the backend.
/// Keep in sync with `backend/src/common/entities/contact.entity.ts`.
class SourceChannel {
  static const String whatsappDirect = 'WHATSAPP_DIRECT';
  static const String metaAds = 'META_ADS';
  static const String metaOrganic = 'META_ORGANIC';
  static const String metaMessenger = 'META_MESSENGER';
  static const String tiktokAds = 'TIKTOK_ADS';
  static const String googleAds = 'GOOGLE_ADS';
  static const String instagram = 'INSTAGRAM';
  static const String landingPage = 'LANDING_PAGE';
  static const String publisher = 'PUBLISHER';
  static const String referral = 'REFERRAL';
  static const String email = 'EMAIL';
  static const String form = 'FORM';
  static const String manual = 'MANUAL';

  static const List<String> all = [
    whatsappDirect,
    metaAds,
    metaOrganic,
    metaMessenger,
    tiktokAds,
    googleAds,
    instagram,
    landingPage,
    publisher,
    referral,
    email,
    form,
    manual,
  ];
}

/// Single source of truth for displaying a source-channel label.
/// Accepts either the canonical enum code, a legacy variant
/// (e.g. "WHATSAPP DIRECT", "Direct Whatsapp"), or `null`.
const Map<String, String> _labels = {
  'WHATSAPP_DIRECT': 'Direct WhatsApp',
  'META_ADS': 'Meta Ads',
  'META_ORGANIC': 'Meta Organic',
  'META_MESSENGER': 'Messenger',
  'TIKTOK_ADS': 'TikTok Ads',
  'GOOGLE_ADS': 'Google Ads',
  'INSTAGRAM': 'Instagram',
  'LANDING_PAGE': 'Landing Page',
  'PUBLISHER': 'Publisher',
  'REFERRAL': 'Referral',
  'EMAIL': 'Email',
  'FORM': 'Form',
  'MANUAL': 'Manual',
};

const Map<String, Color> _colors = {
  'WHATSAPP_DIRECT': Color(0xFF25D366),
  'META_ADS': Color(0xFF0084FF),
  'META_ORGANIC': Color(0xFF0084FF),
  'META_MESSENGER': Color(0xFF0084FF),
  'TIKTOK_ADS': Color(0xFF111827),
  'GOOGLE_ADS': Color(0xFFEA4335),
  'INSTAGRAM': Color(0xFFE4405F),
  'LANDING_PAGE': Color(0xFF8B5CF6),
  'PUBLISHER': Color(0xFF8B5CF6),
  'FORM': Color(0xFF8B5CF6),
  'REFERRAL': Color(0xFFF59E0B),
  'EMAIL': Color(0xFF06B6D4),
  'MANUAL': Color(0xFF9CA3AF),
};

/// Normalize an arbitrary source-channel string to the canonical enum code.
/// Examples:
///   "WHATSAPP DIRECT"   → "WHATSAPP_DIRECT"
///   "Direct WhatsApp"   → "WHATSAPP_DIRECT"
///   "direct whatsapp 1" → "WHATSAPP_DIRECT"
///   "meta_ads"          → "META_ADS"
///   null / ""           → null
String? normalizeSourceChannel(String? raw) {
  if (raw == null) return null;
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;

  // Direct match on canonical code.
  final upper = trimmed.toUpperCase().replaceAll(' ', '_');
  if (_labels.containsKey(upper)) return upper;

  // Strip trailing numbering / punctuation (e.g. "Direct Whatsapp 1.")
  final cleaned = trimmed
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z\s]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  const synonyms = <String, String>{
    'direct whatsapp': 'WHATSAPP_DIRECT',
    'whatsapp direct': 'WHATSAPP_DIRECT',
    'whatsapp': 'WHATSAPP_DIRECT',
    'meta ads': 'META_ADS',
    'facebook ads': 'META_ADS',
    'meta organic': 'META_ORGANIC',
    'messenger': 'META_MESSENGER',
    'meta messenger': 'META_MESSENGER',
    'tiktok ads': 'TIKTOK_ADS',
    'tiktok': 'TIKTOK_ADS',
    'google ads': 'GOOGLE_ADS',
    'instagram': 'INSTAGRAM',
    'ig': 'INSTAGRAM',
    'landing page': 'LANDING_PAGE',
    'publisher': 'PUBLISHER',
    'referral': 'REFERRAL',
    'email': 'EMAIL',
    'form': 'FORM',
    'manual': 'MANUAL',
  };

  for (final entry in synonyms.entries) {
    if (cleaned == entry.key || cleaned.startsWith('${entry.key} ')) {
      return entry.value;
    }
  }
  return null;
}

/// Return the display label for a source-channel code or raw value.
/// Falls back to a title-cased version of the input if unknown.
String prettySourceChannel(String? raw, {String fallback = 'Unknown'}) {
  if (raw == null || raw.trim().isEmpty) return fallback;
  final code = normalizeSourceChannel(raw);
  if (code != null) return _labels[code] ?? fallback;
  // Unknown — title-case and drop underscores so at least it looks consistent.
  return raw
      .trim()
      .toLowerCase()
      .split(RegExp(r'[_\s]+'))
      .where((p) => p.isNotEmpty)
      .map((p) => '${p[0].toUpperCase()}${p.substring(1)}')
      .join(' ');
}

/// Brand color for a source channel (for chips, legends, etc).
Color sourceChannelColor(String? raw) {
  final code = normalizeSourceChannel(raw);
  return _colors[code] ?? const Color(0xFF9CA3AF);
}
