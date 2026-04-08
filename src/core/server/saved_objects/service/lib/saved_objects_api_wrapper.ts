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
  SavedObjectsDeleteOptions,
  SavedObjectsFindResponse,
} from '../saved_objects_client';
import { SavedObjectsFindOptions } from '../../types';
import { SavedObjectsErrorHelpers } from './errors';
import { SavedObjectsSerializer } from '../../serialization';
import { Logger } from '../../../logging';

/**
 * Wrapper that routes saved object operations to the backend saved objects API.
 * Falls back to the underlying saved objects client if the API is unavailable.
 */
export class SavedObjectsApiWrapper {
  constructor(
    private readonly getOpenSearchClient: (request: any) => any,
    private readonly index: string,
    private readonly logger: Logger
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

    const normalizeApiError = (
      type: string,
      id: string,
      apiError: any,
      requiredPermission: string
    ): never => {
      const permissionMessage = `Missing permission "${requiredPermission}" to access saved objects.`;
      if (apiError?.statusCode === 401) {
        throw SavedObjectsErrorHelpers.decorateNotAuthorizedError(apiError, permissionMessage);
      }
      if (apiError?.statusCode === 403) {
        throw SavedObjectsErrorHelpers.decorateForbiddenError(apiError, permissionMessage);
      }
      if (apiError?.statusCode === 404) {
        throw SavedObjectsErrorHelpers.createGenericNotFoundError(type, id);
      }
      if (apiError?.statusCode === 409) {
        throw SavedObjectsErrorHelpers.createConflictError(type, id);
      }
      throw apiError;
    };

    const isApiUnavailable = (apiError: any) =>
      apiError?.statusCode === 404 && apiError?.body?.error?.type === 'status_exception';

    const buildRawDoc = <T = unknown>(
      type: string,
      id: string,
      attributes: T,
      options: Pick<
        SavedObjectsCreateOptions,
        'migrationVersion' | 'references' | 'version' | 'permissions'
      > &
        Partial<Pick<SavedObjectsUpdateOptions, 'workspaces'>>
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

    const shouldUseApi = () => !!opensearchClient;

    const getWithApi = async <T = unknown>(type: string, id: string): Promise<SavedObject<T>> => {
      if (!shouldUseApi()) {
        return wrapperOptions.client.get<T>(type, id);
      }

      const rawId = serializer.generateRawId(undefined, type, id);
      this.logger.debug(
        `Saved objects GET via API for [${type}:${id}] rawId [${rawId}] in [${this.index}]`
      );

      try {
        const response = await opensearchClient.transport.request({
          method: 'GET',
          path: `/_opensearch_dashboards/saved_objects/${encodeURIComponent(
            this.index
          )}/${encodeURIComponent(rawId)}`,
        });
        return rawToSavedObject<T>(type, id, response.body);
      } catch (apiError: any) {
        if (isApiUnavailable(apiError)) {
          this.logger.debug(
            `Saved objects API not available, falling back for GET [${type}:${id}]`
          );
          return wrapperOptions.client.get<T>(type, id);
        }
        return normalizeApiError(type, id, apiError, 'osd:saved_object/get');
      }
    };

    const createWithApi = async <T = unknown>(
      type: string,
      attributes: T,
      options: SavedObjectsCreateOptions = {}
    ): Promise<SavedObject<T>> => {
      if (!shouldUseApi() || !options.id) {
        return wrapperOptions.client.create<T>(type, attributes, options);
      }

      const raw = buildRawDoc(type, options.id, attributes, options as any);
      this.logger.debug(
        `Saved objects CREATE via API for [${type}:${options.id}] rawId [${raw._id}] in [${this.index}]`
      );

      try {
        await opensearchClient.transport.request({
          method: 'PUT',
          path: `/_opensearch_dashboards/saved_objects/${encodeURIComponent(
            this.index
          )}/${encodeURIComponent(raw._id)}?operation=create`,
          body: raw._source,
        });
        return rawToSavedObject<T>(type, options.id, raw._source);
      } catch (apiError: any) {
        if (isApiUnavailable(apiError)) {
          this.logger.debug(
            `Saved objects API not available, falling back for CREATE [${type}:${options.id}]`
          );
          return wrapperOptions.client.create<T>(type, attributes, options);
        }
        return normalizeApiError(type, options.id, apiError, 'osd:saved_object/write');
      }
    };

    const updateWithApi = async <T = unknown>(
      type: string,
      id: string,
      attributes: Partial<T>,
      options: SavedObjectsUpdateOptions = {}
    ): Promise<SavedObjectsUpdateResponse<T>> => {
      if (!shouldUseApi()) {
        return wrapperOptions.client.update<T>(type, id, attributes, options);
      }

      this.logger.debug(`Saved objects UPDATE via API for [${type}:${id}] in [${this.index}]`);

      const existing = await getWithApi<T>(type, id);
      const mergedAttributes = {
        ...(existing.attributes as Record<string, any>),
        ...(attributes as Record<string, any>),
      } as T;

      const raw = buildRawDoc(type, id, mergedAttributes, {
        migrationVersion: existing.migrationVersion,
        references: options.references ?? existing.references,
        version: options.version ?? existing.version,
        permissions: options.permissions ?? existing.permissions,
        workspaces: options.workspaces ?? existing.workspaces,
      });

      try {
        await opensearchClient.transport.request({
          method: 'PUT',
          path: `/_opensearch_dashboards/saved_objects/${encodeURIComponent(
            this.index
          )}/${encodeURIComponent(raw._id)}?operation=update`,
          body: raw._source,
        });
        return rawToSavedObject<T>(type, id, raw._source);
      } catch (apiError: any) {
        if (isApiUnavailable(apiError)) {
          this.logger.debug(
            `Saved objects API not available, falling back for UPDATE [${type}:${id}]`
          );
          return wrapperOptions.client.update<T>(type, id, attributes, options);
        }
        return normalizeApiError(type, id, apiError, 'osd:saved_object/write');
      }
    };

    const deleteWithApi = async (
      type: string,
      id: string,
      options: SavedObjectsDeleteOptions = {}
    ): Promise<{}> => {
      if (!shouldUseApi()) {
        return wrapperOptions.client.delete(type, id, options);
      }

      const rawId = serializer.generateRawId(undefined, type, id);
      this.logger.debug(
        `Saved objects DELETE via API for [${type}:${id}] rawId [${rawId}] in [${this.index}]`
      );

      try {
        await opensearchClient.transport.request({
          method: 'DELETE',
          path: `/_opensearch_dashboards/saved_objects/${encodeURIComponent(
            this.index
          )}/${encodeURIComponent(rawId)}`,
        });
        return {};
      } catch (apiError: any) {
        if (isApiUnavailable(apiError)) {
          this.logger.debug(
            `Saved objects API not available, falling back for DELETE [${type}:${id}]`
          );
          return wrapperOptions.client.delete(type, id, options);
        }
        return normalizeApiError(type, id, apiError, 'osd:saved_object/delete');
      }
    };

    const findWithApi = async <T = unknown>(
      options: SavedObjectsFindOptions
    ): Promise<SavedObjectsFindResponse<T>> => {
      if (!shouldUseApi()) {
        return wrapperOptions.client.find<T>(options);
      }

      this.logger.debug(
        `Saved objects FIND via API for types [${options.type}] in [${this.index}]`
      );

      try {
        const perPage = options.perPage || 20;
        const page = options.page || 1;
        const body: Record<string, any> = {
          size: perPage,
          from: (page - 1) * perPage,
        };

        if (options.sortField) {
          body.sort = [{ [options.sortField]: { order: options.sortOrder || 'asc' } }];
        }

        const must: any[] = [];
        const filter: any[] = [];
        const types = Array.isArray(options.type) ? options.type : [options.type];
        filter.push({ terms: { type: types } });

        if (options.search) {
          const fields = options.searchFields
            ? options.searchFields.map((f) => (types.length === 1 ? `${types[0]}.${f}` : f))
            : ['_all'];
          must.push({
            simple_query_string: {
              query: options.search,
              fields,
              default_operator: options.defaultSearchOperator || 'OR',
            },
          });
        }

        if (options.hasReference) {
          filter.push({
            nested: {
              path: 'references',
              query: {
                bool: {
                  must: [
                    { term: { 'references.type': options.hasReference.type } },
                    { term: { 'references.id': options.hasReference.id } },
                  ],
                },
              },
            },
          });
        }

        body.query = {
          bool: {
            ...(must.length ? { must } : {}),
            filter,
          },
        };

        if (options.fields) {
          body._source = {
            includes: options.fields.flatMap((f) => types.map((t) => `${t}.${f}`)),
          };
        }

        const response = await opensearchClient.transport.request({
          method: 'POST',
          path: `/_opensearch_dashboards/saved_objects/${encodeURIComponent(this.index)}/_search`,
          body,
        });

        const hits = response.body?.hits?.hits || [];
        const total = response.body?.hits?.total?.value ?? response.body?.hits?.total ?? 0;

        const savedObjects = hits.map((hit: any) => {
          const parsed = serializer.rawToSavedObject(hit as any);
          return { ...parsed, score: hit._score };
        });

        return {
          saved_objects: savedObjects,
          total,
          per_page: perPage,
          page,
        } as SavedObjectsFindResponse<T>;
      } catch (apiError: any) {
        if (isApiUnavailable(apiError)) {
          this.logger.debug(`Saved objects API not available, falling back for FIND`);
          return wrapperOptions.client.find<T>(options);
        }
        throw apiError;
      }
    };

    return {
      ...wrapperOptions.client,
      get: getWithApi,
      create: createWithApi,
      update: updateWithApi,
      delete: deleteWithApi,
      find: findWithApi,
    };
  };
}
