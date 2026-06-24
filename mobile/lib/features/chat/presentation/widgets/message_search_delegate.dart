import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../domain/entities/message.dart';
import '../controllers/chat_providers.dart';
import 'message_bubble.dart';

class MessageSearchDelegate extends SearchDelegate<Message?> {
  MessageSearchDelegate(this.ref, this.conversationId);

  final WidgetRef ref;
  final String conversationId;
  DateTime? _filterDate;

  @override
  String get searchFieldLabel => 'Search messages...';

  @override
  List<Widget> buildActions(BuildContext context) {
    return [
      IconButton(
        icon: Icon(
          _filterDate != null ? Icons.calendar_month : Icons.calendar_month_outlined,
          color: _filterDate != null ? AppColors.primary : null,
        ),
        onPressed: () async {
          final date = await showDatePicker(
            context: context,
            initialDate: _filterDate ?? DateTime.now(),
            firstDate: DateTime(2020),
            lastDate: DateTime.now(),
          );
          if (date != null) {
            _filterDate = date;
            showResults(context); // re-trigger search
          }
        },
        tooltip: 'Filter by date',
      ),
      if (query.isNotEmpty || _filterDate != null)
        IconButton(
          icon: const Icon(Icons.clear),
          onPressed: () {
            if (query.isEmpty) {
              _filterDate = null;
            } else {
              query = '';
            }
            showResults(context);
          },
        ),
    ];
  }

  @override
  Widget buildLeading(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.arrow_back),
      onPressed: () => close(context, null),
    );
  }

  @override
  Widget buildResults(BuildContext context) {
    if (query.trim().isEmpty && _filterDate == null) {
      return const Center(child: Text('Type to search or select a date'));
    }

    final repo = ref.read(chatRepositoryProvider);
    
    return FutureBuilder(
      future: repo.searchMessages(conversationId, q: query.trim(), date: _filterDate),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return const Center(child: Text('Error searching messages'));
        }
        final result = snapshot.data;
        if (result == null || result.isErr) {
          return const Center(child: Text('Could not load results'));
        }

        final messages = result.valueOrNull ?? [];
        if (messages.isEmpty) {
          return const Center(child: Text('No messages found'));
        }

        return ListView.builder(
          padding: const EdgeInsets.symmetric(vertical: 16),
          itemCount: messages.length,
          itemBuilder: (context, index) {
            final m = messages[index];
            return AbsorbPointer(
              child: MessageBubble(message: m),
            );
          },
        );
      },
    );
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    return const Center(child: Text('Search by text or date'));
  }
}
