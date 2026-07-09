import 'package:flutter/widgets.dart';

/// Bilingual pipeline stage names. Mirrors the web: a default (system) stage
/// still holding its English canonical name is translated per language, while a
/// dealer's custom rename shows verbatim (it won't be in the map). Matching on
/// the English canonical keeps this collision-safe — unlike a blanket `.tr()`,
/// the generic word "Lost" elsewhere isn't affected.
const Map<String, String> _stageId = {
  'New Lead': 'Prospek Baru',
  'Contacted': 'Dihubungi',
  'Qualified': 'Memenuhi Syarat',
  'Appointment': 'Janji Temu',
  'Negotiation': 'Negosiasi',
  'Purchase': 'Pembelian',
  'Lost': 'Batal Tidak Pembelian',
  'Lost (Bought Elsewhere)': 'Batal Pembelian',
};

/// Localized display name for a pipeline stage (null/empty safe).
String stageLabel(BuildContext context, String? name) {
  if (name == null || name.isEmpty) return '';
  if (Localizations.localeOf(context).languageCode == 'id') {
    return _stageId[name] ?? name;
  }
  return name;
}
