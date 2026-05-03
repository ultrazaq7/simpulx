// Conditional export - uses native dart:io on mobile, stub on web
export 'file_reader_stub.dart'
    if (dart.library.io) 'file_reader_native.dart';
