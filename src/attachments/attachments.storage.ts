/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AttachmentsStorage {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;

    if (!url || !key || !bucket) {
      throw new Error('Supabase Storage environment variables are missing');
    }

    this.client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.bucket = bucket;
  }

  async createUploadUrl(storageKey: string) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(storageKey, {
        upsert: false,
      });

    if (error || !data) {
      throw new InternalServerErrorException('Could not create upload URL');
    }

    return data;
  }

  async createDownloadUrl(storageKey: string) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(storageKey, 300);

    if (error || !data) {
      throw new InternalServerErrorException('Could not create download URL');
    }

    return data.signedUrl;
  }

  async getFileInfo(storageKey: string) {
    const lastSlash = storageKey.lastIndexOf('/');

    const directory = storageKey.slice(0, lastSlash);
    const fileName = storageKey.slice(lastSlash + 1);

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .info(`${directory}/${fileName}`);

    if (error || !data) {
      return null;
    }

    return data;
  }

  async deleteFile(storageKey: string) {
    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([storageKey]);

    if (error) {
      throw new InternalServerErrorException(
        'Could not delete attachment from storage',
      );
    }
  }
}
