/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { inspect } from 'util';
import { SavedObjectsClientWrapperFactory } from './scoped_client_provider';
import { SavedObject } from '../../types';
import {
  SavedObjectsCreateOptions,
  SavedObjectsUpdateOptions,
  SavedObjectsUpdateResponse,
} from '../saved_objects_client';

/**
 * Wrapper that routes config type operations to the new advanced settings API
 */
export class ConfigApiWrapper {
  constructor(
    private readonly getOpenSearchClient: (request: any) => any,
    private readonly index: string
  ) {}

  public wrapperFactory: SavedObjectsClientWrapperFactory = (wrapperOptions) => {
    const opensearchClient = this.getOpenSearchClient(wrapperOptions.request);

    const getWithApi = async <T = unknown>(type: string, id: string): Promise<SavedObject<T>> => {
      if (type === 'config' && opensearchClient) {
        try {
          const response = await opensearchClient.transport.request({
            method: 'GET',
            path: `/_opensearch_dashboards/advanced_settings/${this.index}`,
          });

          const doc = response.body;
          return {
            ...doc,
            attributes: doc.attributes || doc[type],
          };
        } catch (apiError: any) {
          if (apiError?.statusCode !== 404 && apiError?.statusCode !== 401) {
            throw apiError;
          }
        }
      }

      return wrapperOptions.client.get<T>(type, id);
    };

    const createWithApi = async <T = unknown>(
      type: string,
      attributes: T,
      options: SavedObjectsCreateOptions = {}
    ): Promise<SavedObject<T>> => {
      if (type === 'config' && opensearchClient) {
        try {
          const response = await opensearchClient.transport.request({
            method: 'PUT',
            path: `/_opensearch_dashboards/advanced_settings/${this.index}`,
            body: attributes,
          });

          const doc = response.body;
          return {
            ...doc,
            attributes: doc.attributes || doc[type],
          };
        } catch (apiError: any) {
          if (apiError?.statusCode !== 404 && apiError?.statusCode !== 401) {
            throw apiError;
          }
        }
      }

      return wrapperOptions.client.create<T>(type, attributes, options);
    };

    const updateWithApi = async <T = unknown>(
      type: string,
      id: string,
      attributes: Partial<T>,
      options: SavedObjectsUpdateOptions = {}
    ): Promise<SavedObjectsUpdateResponse<T>> => {
      if (type === 'config' && opensearchClient) {
        try {
          const response = await opensearchClient.transport.request({
            method: 'PUT',
            path: `/_opensearch_dashboards/advanced_settings/${this.index}`,
            body: attributes,
          });

          const doc = response.body;
          return {
            ...doc,
            attributes: doc.attributes || doc[type],
          };
        } catch (apiError: any) {
          if (apiError?.statusCode !== 404 && apiError?.statusCode !== 401) {
            throw apiError;
          }
        }
      }

      return wrapperOptions.client.update<T>(type, id, attributes, options);
    };

    return {
      ...wrapperOptions.client,
      get: getWithApi,
      create: createWithApi,
      update: updateWithApi,
    };
  };
}
