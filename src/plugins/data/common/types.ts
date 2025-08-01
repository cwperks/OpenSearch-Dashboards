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

import { DataFrameAggConfig, IDataFrame } from './data_frames';
import { Query } from './query';
import { BucketAggType, MetricAggType } from './search';

export * from './query/types';
export * from './osd_field_types/types';
export * from './data_views/types';
export * from './index_patterns/types';
export * from './data_frames/types';
export * from './datasets/types';

/**
 * If a service is being shared on both the client and the server, and
 * the client code requires synchronous access to uiSettings, both client
 * and server should wrap the core uiSettings services in a function
 * matching this signature.
 *
 * This matches the signature of the public `core.uiSettings.get`, and
 * should only be used in scenarios where async access to uiSettings is
 * not possible.
 */
export type GetConfigFn = <T = any>(key: string, defaultOverride?: T) => T;
export type GetDataFrameFn = () => IDataFrame | undefined;
export type GetDataFrameAggQsFn = ({
  query,
  aggConfig,
  timeField,
  timeFilter,
}: {
  query: Query;
  aggConfig: DataFrameAggConfig;
  timeField: any;
  timeFilter: any;
}) => any;

export type DestroyDataFrameFn = () => void;
export type GetAggTypeFn = (id: string) => BucketAggType<any> | MetricAggType<any>;
