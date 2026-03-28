/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

import { ConfigApiWrapper } from './config_api_wrapper';
import { typeRegistryMock } from '../../saved_objects_type_registry.mock';
import { SavedObjectsErrorHelpers } from './errors';

describe('ConfigApiWrapper', () => {
  const request = {} as any;
  const index = '.kibana_1';
  const typeRegistry = typeRegistryMock.create();

  const createWrapper = ({
    transportRequest = jest.fn(),
    client = {},
  }: {
    transportRequest?: jest.Mock;
    client?: Record<string, any>;
  } = {}) => {
    const opensearchClient = {
      transport: {
        request: transportRequest,
      },
    };

    const wrapper = new ConfigApiWrapper(() => opensearchClient, index);

    return {
      transportRequest,
      client: wrapper.wrapperFactory({
        request,
        typeRegistry,
        client: {
          get: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          ...(client as any),
        } as any,
      }),
    };
  };

  it('gets a config doc from the backend using the saved object id', async () => {
    const transportRequest = jest.fn().mockResolvedValue({
      body: {
        type: 'config',
        config: {
          buildNum: 1,
          'dateFormat:tz': 'UTC',
        },
        references: [],
        updated_at: '2026-03-28T00:00:00.000Z',
      },
    });

    const { client } = createWrapper({ transportRequest });
    const result = await client.get('config', '3.6.0');

    expect(transportRequest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/_opensearch_dashboards/advanced_settings/.kibana_1/config%3A3.6.0',
    });
    expect(result.id).toBe('3.6.0');
    expect(result.type).toBe('config');
    expect(result.attributes).toEqual({
      buildNum: 1,
      'dateFormat:tz': 'UTC',
    });
  });

  it('creates a raw config doc and sends the canonical source to the backend', async () => {
    const transportRequest = jest.fn().mockResolvedValue({ body: {} });
    const { client } = createWrapper({ transportRequest });

    const result = await client.create(
      'config',
      { buildNum: 1, 'dateFormat:tz': 'UTC' },
      {
        id: '3.6.0',
        migrationVersion: { config: '1.0.0' },
        permissions: { read: ['*'] } as any,
      }
    );

    expect(transportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/_opensearch_dashboards/advanced_settings/.kibana_1/config%3A3.6.0?operation=create',
      })
    );
    expect(transportRequest.mock.calls[1][0].body).toEqual(
      expect.objectContaining({
        type: 'config',
        config: {
          buildNum: 1,
          'dateFormat:tz': 'UTC',
        },
        migrationVersion: { config: '1.0.0' },
        permissions: { read: ['*'] },
        references: [],
      })
    );
    expect(result.id).toBe('3.6.0');
    expect(result.attributes).toEqual({ buildNum: 1, 'dateFormat:tz': 'UTC' });
  });

  it('updates by merging existing attributes and preserving metadata before calling backend', async () => {
    const transportRequest = jest
      .fn()
      .mockResolvedValueOnce({
        body: {
          type: 'config',
          config: {
            buildNum: 1,
            'dateFormat:tz': 'UTC',
            'theme:darkMode': true,
          },
          migrationVersion: { config: '1.0.0' },
          permissions: { read: ['*'] },
          references: [],
          updated_at: '2026-03-28T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({ body: {} });

    const { client } = createWrapper({ transportRequest });
    const result = await client.update('config', '3.6.0', {
      'dateFormat:tz': 'America/New_York',
    });

    expect(transportRequest.mock.calls[0][0]).toEqual({
      method: 'GET',
      path: '/_opensearch_dashboards/advanced_settings/.kibana_1/config%3A3.6.0',
    });
    expect(transportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/_opensearch_dashboards/advanced_settings/.kibana_1/config%3A3.6.0?operation=update',
      })
    );
    expect(transportRequest.mock.calls[0][0].body).toEqual(
      expect.objectContaining({
        type: 'config',
        config: {
          buildNum: 1,
          'dateFormat:tz': 'America/New_York',
          'theme:darkMode': true,
        },
        migrationVersion: { config: '1.0.0' },
        permissions: { read: ['*'] },
        references: [],
      })
    );
    expect(result.attributes).toEqual({
      buildNum: 1,
      'dateFormat:tz': 'America/New_York',
      'theme:darkMode': true,
    });
  });

  it('translates backend 404s into saved object not found errors', async () => {
    const { client } = createWrapper({
      transportRequest: jest.fn().mockRejectedValue({ statusCode: 404 }),
    });

    try {
      await client.get('config', '3.6.0');
      fail('expected get to throw');
    } catch (error) {
      expect(SavedObjectsErrorHelpers.isNotFoundError(error as Error)).toBe(true);
    }
  });
});
