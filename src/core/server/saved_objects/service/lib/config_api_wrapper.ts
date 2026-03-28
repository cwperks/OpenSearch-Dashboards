/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsClientWrapperFactory } from './scoped_client_provider';
import { SavedObject } from '../../types';
import {
  SavedObjectsCreateOptions,
  SavedObjectsUpdateOptions,
  SavedObjectsUpdateResponse,
} from '../saved_objects_client';
import { SavedObjectsErrorHelpers } from './errors';
import { SavedObjectsSerializer } from '../../serialization';

/**
 * Wrapper that routes config type operations to the advanced settings API.
 * OpenSearch Dashboards still builds the canonical saved object document; the backend
 * only authorizes and persists it.
 */
export class ConfigApiWrapper {
  constructor(
    private readonly getOpenSearchClient: (request: any) => any,
    private readonly index: string
  ) {}

  public wrapperFactory: SavedObjectsClientWrapperFactory = (wrapperOptions) => {
    const opensearchClient = this.getOpenSearchClient(wrapperOptions.request);
    const serializer = new SavedObjectsSerializer(wrapperOptions.typeRegistry);

    const rawToSavedObject = <T = unknown>(
      type: string,
      id: string,
      source: Record<string, any>
    ) => {
      const raw = {
        _id: serializer.generateRawId(undefined, type, id),
        _source: source,
      };

      const savedObject = serializer.rawToSavedObject(raw as any) as SavedObject<T>;
      if (wrapperOptions.typeRegistry.isSingleNamespace(type)) {
        savedObject.namespaces = ['default'];
      }
      delete (savedObject as any).namespace;

      return savedObject;
    };

    const normalizeApiError = (type: string, id: string, apiError: any): never => {
      if (apiError?.statusCode === 401) {
        throw SavedObjectsErrorHelpers.decorateNotAuthorizedError(apiError);
      }
      if (apiError?.statusCode === 403) {
        throw SavedObjectsErrorHelpers.decorateForbiddenError(apiError);
      }
      if (apiError?.statusCode === 404) {
        throw SavedObjectsErrorHelpers.createGenericNotFoundError(type, id);
      }
      if (apiError?.statusCode === 409) {
        throw SavedObjectsErrorHelpers.createConflictError(type, id);
      }
      throw apiError;
    };

    const buildRawConfigDoc = <T = unknown>(
      type: string,
      id: string,
      attributes: T,
      options: Pick<
        SavedObjectsCreateOptions,
        'migrationVersion' | 'references' | 'version' | 'permissions'
      > &
        Pick<SavedObjectsUpdateOptions, 'workspaces'>
    ) => {
      return serializer.savedObjectToRaw({
        id,
        type,
        attributes,
        migrationVersion: options.migrationVersion,
        references: options.references || [],
        updated_at: new Date().toISOString(),
        ...(options.version ? { version: options.version } : {}),
        ...(options.workspaces ? { workspaces: options.workspaces } : {}),
        ...(options.permissions ? { permissions: options.permissions } : {}),
      } as any);
    };

    const getWithApi = async <T = unknown>(type: string, id: string): Promise<SavedObject<T>> => {
      if (type !== 'config' || !opensearchClient) {
        return wrapperOptions.client.get<T>(type, id);
      }

      const rawId = serializer.generateRawId(undefined, type, id);

      try {
        const response = await opensearchClient.transport.request({
          method: 'GET',
          path: `/_opensearch_dashboards/advanced_settings/${encodeURIComponent(
            this.index
          )}/${encodeURIComponent(rawId)}`,
        });

        return rawToSavedObject<T>(type, id, response.body);
      } catch (apiError: any) {
        normalizeApiError(type, id, apiError);
      }
    };

    const createWithApi = async <T = unknown>(
      type: string,
      attributes: T,
      options: SavedObjectsCreateOptions = {}
    ): Promise<SavedObject<T>> => {
      if (type !== 'config' || !opensearchClient || !options.id) {
        return wrapperOptions.client.create<T>(type, attributes, options);
      }

      const raw = buildRawConfigDoc(type, options.id, attributes, options);

      try {
        await opensearchClient.transport.request({
          method: 'PUT',
          path: `/_opensearch_dashboards/advanced_settings/${encodeURIComponent(
            this.index
          )}/${encodeURIComponent(raw._id)}?operation=create`,
          body: raw._source,
        });

        return rawToSavedObject<T>(type, options.id, raw._source);
      } catch (apiError: any) {
        normalizeApiError(type, options.id, apiError);
      }
    };

    const updateWithApi = async <T = unknown>(
      type: string,
      id: string,
      attributes: Partial<T>,
      options: SavedObjectsUpdateOptions = {}
    ): Promise<SavedObjectsUpdateResponse<T>> => {
      if (type !== 'config' || !opensearchClient) {
        return wrapperOptions.client.update<T>(type, id, attributes, options);
      }

      const existing = await getWithApi<T>(type, id);
      const mergedAttributes = {
        ...(existing.attributes as Record<string, any>),
        ...(attributes as Record<string, any>),
      } as T;

      const raw = buildRawConfigDoc(type, id, mergedAttributes, {
        migrationVersion: existing.migrationVersion,
        references: options.references ?? existing.references,
        version: options.version ?? existing.version,
        permissions: options.permissions ?? existing.permissions,
        workspaces: options.workspaces ?? existing.workspaces,
      });

      try {
        await opensearchClient.transport.request({
          method: 'PUT',
          path: `/_opensearch_dashboards/advanced_settings/${encodeURIComponent(
            this.index
          )}/${encodeURIComponent(raw._id)}?operation=update`,
          body: raw._source,
        });

        return rawToSavedObject<T>(type, id, raw._source);
      } catch (apiError: any) {
        normalizeApiError(type, id, apiError);
      }
    };

    return {
      ...wrapperOptions.client,
      get: getWithApi,
      create: createWithApi,
      update: updateWithApi,
    };
  };
}
