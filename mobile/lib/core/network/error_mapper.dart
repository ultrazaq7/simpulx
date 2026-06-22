import 'package:dio/dio.dart';

import '../error/app_exception.dart';
import '../error/failure.dart';

/// Translates low-level [DioException]s into typed [AppException]s, and
/// [AppException]/unknown errors into domain [Failure]s.
class ErrorMapper {
  ErrorMapper._();

  /// Dio error -> typed [AppException].
  static AppException fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const TimeoutException();
      case DioExceptionType.connectionError:
        return const NetworkException();
      case DioExceptionType.cancel:
        return const NetworkException('Request cancelled');
      case DioExceptionType.badCertificate:
        return const NetworkException('Bad certificate');
      case DioExceptionType.badResponse:
      case DioExceptionType.unknown:
        final status = e.response?.statusCode;
        final message = _extractMessage(e.response?.data) ??
            e.message ??
            'Request failed';
        switch (status) {
          case 401:
            return UnauthorizedException(message);
          case 403:
          case 404:
            // Backend masks IDOR as 404.
            return NotFoundException(message);
          case 422:
            return ValidationException(message,
                fieldErrors: _extractFieldErrors(e.response?.data));
          default:
            return ServerException(message, statusCode: status);
        }
    }
  }

  /// Any error -> domain [Failure] for repositories.
  static Failure toFailure(Object error) {
    final exception = error is AppException
        ? error
        : (error is DioException ? fromDio(error) : null);

    return switch (exception) {
      NetworkException() => NetworkFailure(exception.message),
      TimeoutException() => NetworkFailure(exception.message),
      UnauthorizedException() => AuthFailure(exception.message),
      NotFoundException() => NotFoundFailure(exception.message),
      ValidationException() => ValidationFailure(
          exception.message,
          fieldErrors: exception.fieldErrors,
        ),
      ServerException() => ServerFailure.withCode(
          exception.message,
          exception.statusCode ?? 500,
        ),
      _ => const UnknownFailure(),
    };
  }

  static String? _extractMessage(Object? data) {
    if (data is Map) {
      final err = data['error'] ?? data['message'];
      if (err is String && err.isNotEmpty) return err;
    }
    if (data is String && data.isNotEmpty && data.length < 240) return data;
    return null;
  }

  static Map<String, String>? _extractFieldErrors(Object? data) {
    if (data is Map && data['errors'] is Map) {
      return (data['errors'] as Map).map(
        (k, v) => MapEntry(k.toString(), v.toString()),
      );
    }
    return null;
  }
}
