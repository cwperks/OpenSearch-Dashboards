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

import { i18n } from '@osd/i18n';
import { useCallback } from 'react';
import { instance as registry } from '../../contexts/editor_context/editor_registry';
import { useRequestActionContext, useServicesContext } from '../../contexts';
import { sendRequestToOpenSearch } from './send_request_to_opensearch';
import { track } from './track';

// @ts-ignore
import { retrieveAutoCompleteInfo } from '../../../lib/mappings/mappings';
import { UI_SETTINGS } from '../../../../../data/common';

export const useSendCurrentRequestToOpenSearch = (dataSourceId?: string) => {
  const {
    services: { history, settings, notifications, trackUiMetric, http, uiSettings },
  } = useServicesContext();

  const dispatch = useRequestActionContext();

  return useCallback(async () => {
    try {
      const editor = registry.getInputEditor();
      const requests = await editor.getRequestsInRange();
      if (!requests.length) {
        notifications.toasts.add(
          i18n.translate('console.notification.error.noRequestSelectedTitle', {
            defaultMessage:
              'No request selected. Select a request by placing the cursor inside it.',
          })
        );
        return;
      }

      dispatch({ type: 'sendRequest', payload: undefined });

      // Fire and forget
      setTimeout(() => track(requests, editor, trackUiMetric), 0);

      const withLongNumeralsSupport = await uiSettings.get(UI_SETTINGS.DATA_WITH_LONG_NUMERALS);

      const results = await sendRequestToOpenSearch({
        http,
        requests,
        dataSourceId,
        withLongNumeralsSupport,
      });

      results.forEach(({ request: { path, method, data } }) => {
        try {
          history.addToHistory(path, method, data);
        } catch (e) {
          // Best effort, but notify the user.
          notifications.toasts.addError(e, {
            title: i18n.translate('console.notification.error.couldNotSaveRequestTitle', {
              defaultMessage: 'Could not save request to history.',
            }),
          });
        }
      });

      const { polling } = settings.toJSON();
      if (polling) {
        // If the user has submitted a request against OpenSearch, something in the fields, indices, aliases,
        // or templates may have changed, so we'll need to update this data. Assume that if
        // the user disables polling they're trying to optimize performance or otherwise
        // preserve resources, so they won't want this request sent either.
        // @ts-expect-error TS2345 TODO(ts-error): fixme
        retrieveAutoCompleteInfo(http, settings, settings.getAutocomplete(), dataSourceId);
      }

      dispatch({
        type: 'requestSuccess',
        payload: {
          data: results,
        },
      });
    } catch (e) {
      if (e?.response) {
        dispatch({
          type: 'requestFail',
          payload: e,
        });
      } else {
        dispatch({
          type: 'requestFail',
          payload: undefined,
        });
        notifications.toasts.addError(e, {
          title: i18n.translate('console.notification.error.unknownErrorTitle', {
            defaultMessage: 'Unknown Request Error',
          }),
        });
      }
    }
  }, [
    dispatch,
    http,
    dataSourceId,
    settings,
    notifications.toasts,
    trackUiMetric,
    history,
    uiSettings,
  ]);
};
