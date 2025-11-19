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

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { defaults } from 'lodash';

import { SavedObjectsClientContract } from '../../saved_objects/types';
import { SavedObjectsErrorHelpers } from '../../saved_objects/';
import { Logger } from '../../logging';

import { getUpgradeableConfig } from './get_upgradeable_config';
import { UiSettingScope } from '../types';
import { buildDocIdWithScope } from '../utils';

interface Options {
  savedObjectsClient: SavedObjectsClientContract;
  version: string;
  buildNum: number;
  log: Logger;
  handleWriteErrors: boolean;
  scope?: UiSettingScope;
  opensearchClient?: any;
  index?: string;
}

export async function createOrUpgradeSavedConfig(
  options: Options
): Promise<Record<string, any> | undefined> {
  const {
    savedObjectsClient,
    version,
    buildNum,
    log,
    handleWriteErrors,
    scope,
    opensearchClient,
    index,
  } = options;

  // try to find an older config we can upgrade
  let upgradeableConfig;
  if (scope === UiSettingScope.USER) {
    upgradeableConfig = undefined;
  } else {
    upgradeableConfig = await getUpgradeableConfig({
      savedObjectsClient,
      version,
    });
  }

  // default to the attributes of the upgradeableConfig if available
  const attributes = defaults(
    { buildNum },
    upgradeableConfig ? (upgradeableConfig.attributes as any) : {}
  );

  // Try new API first if available
  if (opensearchClient && index) {
    try {
      await opensearchClient.transport.request({
        method: 'PUT',
        path: `/_opensearch_dashboards/advanced_settings/${index}`,
        body: attributes,
      });

      if (upgradeableConfig) {
        log.debug(`Upgrade config from ${upgradeableConfig.id} to ${version}`, {
          prevVersion: upgradeableConfig.id,
          newVersion: version,
          scope,
        });
      }
      return;
    } catch (apiError: any) {
      // Fall back to saved objects if API not available
      if (apiError?.statusCode !== 404 && apiError?.statusCode !== 401) {
        if (handleWriteErrors) {
          return attributes;
        }
        throw apiError;
      }
      log.debug('Advanced settings API not available, falling back to saved objects');
    }
  }

  // Fallback to saved objects approach
  try {
    const docId = buildDocIdWithScope(version, scope);
    // create the new SavedConfig
    await savedObjectsClient.create('config', attributes, { id: docId });
  } catch (error) {
    if (handleWriteErrors) {
      if (SavedObjectsErrorHelpers.isConflictError(error)) {
        return;
      }

      if (
        SavedObjectsErrorHelpers.isNotAuthorizedError(error) ||
        SavedObjectsErrorHelpers.isForbiddenError(error)
      ) {
        return attributes;
      }
    }

    throw error;
  }

  if (upgradeableConfig) {
    log.debug(`Upgrade config from ${upgradeableConfig.id} to ${version}`, {
      prevVersion: upgradeableConfig.id,
      newVersion: version,
      scope,
    });
  }
}
