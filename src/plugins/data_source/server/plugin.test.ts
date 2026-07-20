/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  coreMock,
  httpServerMock,
  savedObjectsClientMock,
  savedObjectsRepositoryMock,
} from '../../../../src/core/server/mocks';
import { DATA_SOURCE_SAVED_OBJECT_TYPE } from '../common';
import { DataSourcePlugin } from './plugin';

describe('DataSourcePlugin', () => {
  it('uses an unwrapped repository scoped to the request when fetching credentials', async () => {
    const initializerContext = coreMock.createPluginInitializerContext();
    const plugin = new DataSourcePlugin(initializerContext);
    const coreStart = coreMock.createStart();
    const credentialSavedObjects = savedObjectsRepositoryMock.create();
    coreStart.savedObjects.createScopedRepository.mockReturnValue(credentialSavedObjects);
    plugin.start(coreStart);

    const getDataSourceClient = jest.fn();
    const getDataSourceLegacyClient = jest.fn();
    const dataSourceService = {
      getDataSourceClient,
      getDataSourceLegacyClient,
    };
    const provider = (plugin as any).createDataSourceRouteHandlerContext(
      dataSourceService,
      {},
      initializerContext.logger.get(),
      Promise.resolve({ asScoped: jest.fn().mockReturnValue({ add: jest.fn() }) }),
      Promise.resolve({}),
      Promise.resolve({})
    );
    const request = httpServerMock.createOpenSearchDashboardsRequest();
    const savedObjects = savedObjectsClientMock.create();

    const context = await provider(
      {
        core: {
          savedObjects: {
            client: savedObjects,
          },
        },
      },
      request
    );
    await context.opensearch.getClient('data-source-id');
    await context.opensearch.legacy.getClient('legacy-data-source-id');

    expect(coreStart.savedObjects.createScopedRepository).toHaveBeenCalledTimes(2);
    expect(coreStart.savedObjects.createScopedRepository).toHaveBeenNthCalledWith(1, request, [
      DATA_SOURCE_SAVED_OBJECT_TYPE,
    ]);
    expect(coreStart.savedObjects.createScopedRepository).toHaveBeenNthCalledWith(2, request, [
      DATA_SOURCE_SAVED_OBJECT_TYPE,
    ]);
    expect(coreStart.savedObjects.createInternalRepository).not.toHaveBeenCalled();
    expect(getDataSourceClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSourceId: 'data-source-id',
        savedObjects,
        credentialSavedObjects,
        request,
      })
    );
    expect(getDataSourceLegacyClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSourceId: 'legacy-data-source-id',
        savedObjects,
        credentialSavedObjects,
        request,
      })
    );
  });
});
