package main

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// storage wraps an S3/MinIO bucket for media uploads.
type storage struct {
	client     *minio.Client
	bucket     string
	publicBase string // browser/WA-reachable base URL, e.g. http://localhost:9010/simpulx-media
}

func newStorage(endpoint, accessKey, secretKey, bucket, publicBase string) (*storage, error) {
	ep := strings.TrimPrefix(strings.TrimPrefix(endpoint, "http://"), "https://")
	cl, err := minio.New(ep, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: strings.HasPrefix(endpoint, "https://"),
	})
	if err != nil {
		return nil, err
	}
	return &storage{client: cl, bucket: bucket, publicBase: strings.TrimRight(publicBase, "/")}, nil
}

// ensureBucket creates the bucket if missing and makes objects publicly readable
// so the dashboard and WhatsApp can fetch media directly.
func (s *storage) ensureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return err
	}
	if !exists {
		if err := s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{}); err != nil {
			return err
		}
	}
	policy := fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}`, s.bucket)
	return s.client.SetBucketPolicy(ctx, s.bucket, policy)
}

func (s *storage) put(ctx context.Context, key, contentType string, r io.Reader, size int64) (string, error) {
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return "", err
	}
	return s.publicBase + "/" + key, nil
}
