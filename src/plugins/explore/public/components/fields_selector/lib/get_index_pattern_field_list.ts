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

import { difference } from 'lodash';
import { DataView, IndexPattern, IndexPatternField } from '../../../../../data/public';

export function getIndexPatternFieldList(
  indexPattern?: IndexPattern | DataView,
  fieldCounts?: Record<string, number>
) {
  if (!indexPattern || !fieldCounts) return [];

  const fieldNamesInDocs = Object.keys(fieldCounts);
  const fieldNamesInIndexPattern = indexPattern.fields.getAll().map((fld) => fld.name);
  const unknownTypes: IndexPatternField[] = [];

  difference(fieldNamesInDocs, fieldNamesInIndexPattern).forEach((unknownFieldName) => {
    unknownTypes.push({
      displayName: String(unknownFieldName),
      name: String(unknownFieldName),
      type: 'unknown',
    } as IndexPatternField);
  });

  return [...indexPattern.fields.getAll(), ...unknownTypes];
}
