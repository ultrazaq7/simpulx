import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_spacing.dart';
import '../../../../core/i18n/i18n.dart';
import '../../domain/entities/contact.dart';
import '../controllers/contacts_providers.dart';

/// Add or edit a contact. Returns the created/edited contact id on success.
Future<String?> showContactForm(BuildContext context, {Contact? existing}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: _ContactForm(existing: existing),
    ),
  );
}

class _ContactForm extends ConsumerStatefulWidget {
  const _ContactForm({this.existing});
  final Contact? existing;

  @override
  ConsumerState<_ContactForm> createState() => _ContactFormState();
}

class _ContactFormState extends ConsumerState<_ContactForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name =
      TextEditingController(text: widget.existing?.fullName ?? '');
  late final TextEditingController _phone =
      TextEditingController(text: widget.existing?.phone ?? '');
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.existing != null;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final controller = ref.read(contactsProvider.notifier);
    if (_isEdit) {
      final ok = await controller.updateContact(
        widget.existing!.id,
        fullName: _name.text.trim(),
        phone: _phone.text.trim(),
      );
      if (!mounted) return;
      if (ok) {
        Navigator.of(context).pop(widget.existing!.id);
      } else {
        setState(() {
          _saving = false;
          _error = 'Could not save. Try again.';
        });
      }
    } else {
      final result = await controller.create(
        fullName: _name.text.trim(),
        phone: _phone.text.trim(),
      );
      if (!mounted) return;
      result.fold(
        (f) => setState(() {
          _saving = false;
          _error = f.message;
        }),
        (contact) => Navigator.of(context).pop(contact.id),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
        child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text((_isEdit ? 'Edit contact' : 'New contact').tr(context),
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.lg),
            TextFormField(
              controller: _name,
              enabled: !_saving,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                labelText: 'Full name'.tr(context),
                prefixIcon: const Icon(Icons.person_outline_rounded),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            TextFormField(
              controller: _phone,
              enabled: !_saving,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'Phone number'.tr(context),
                prefixIcon: const Icon(Icons.phone_outlined),
              ),
              validator: (_) {
                if (_name.text.trim().isEmpty && _phone.text.trim().isEmpty) {
                  return 'Enter a name or phone'.tr(context);
                }
                return null;
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.md),
              Text(_error!,
                  style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
            const SizedBox(height: AppSpacing.xl),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.4, color: Colors.white),
                    )
                  : Text((_isEdit ? 'Save' : 'Create contact').tr(context)),
            ),
          ],
        ),
      ),
      ),
    );
  }
}
