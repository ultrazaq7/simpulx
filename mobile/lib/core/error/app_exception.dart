/// Transport/data-layer exceptions thrown by datasources.
///
/// The network interceptor + repositories convert Dio errors into one of these,
/// then map them to a [Failure] for the domain layer.
sealed class AppException implements Exception {
  const AppException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => '$runtimeType($statusCode): $message';
}

class NetworkException extends AppException {
  const NetworkException([super.message = 'No internet connection']);
}

class TimeoutException extends AppException {
  const TimeoutException([super.message = 'Request timed out']);
}

class ServerException extends AppException {
  const ServerException(super.message, {super.statusCode});
}

class UnauthorizedException extends AppException {
  const UnauthorizedException([super.message = 'Unauthorized'])
      : super(statusCode: 401);
}

class NotFoundException extends AppException {
  const NotFoundException([super.message = 'Not found'])
      : super(statusCode: 404);
}

class ValidationException extends AppException {
  const ValidationException(super.message, {this.fieldErrors})
      : super(statusCode: 422);
  final Map<String, String>? fieldErrors;
}
