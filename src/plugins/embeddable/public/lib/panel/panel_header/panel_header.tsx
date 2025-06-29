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
import {
  EuiContextMenuPanelDescriptor,
  EuiBadge,
  EuiIcon,
  EuiToolTip,
  EuiScreenReaderOnly,
  EuiNotificationBadge,
} from '@elastic/eui';
import classNames from 'classnames';
import React from 'react';
import { Action } from 'src/plugins/ui_actions/public';
import { PanelOptionsMenu } from './panel_options_menu';
import { IEmbeddable } from '../../embeddables';
import { EmbeddableContext, panelBadgeTrigger, panelNotificationTrigger } from '../../triggers';
import { uiToReactComponent } from '../../../../../opensearch_dashboards_react/public';

export interface PanelHeaderProps {
  title?: string;
  isViewMode: boolean;
  hidePanelTitle: boolean;
  hidePanelAction: boolean;
  getActionContextMenuPanel: () => Promise<EuiContextMenuPanelDescriptor[]>;
  closeContextMenu: boolean;
  badges: Array<Action<EmbeddableContext>>;
  notifications: Array<Action<EmbeddableContext>>;
  embeddable: IEmbeddable;
  headerId?: string;
  showPlaceholderTitle?: boolean;
}

function renderBadges(badges: Array<Action<EmbeddableContext>>, embeddable: IEmbeddable) {
  return badges.map((badge) => (
    <EuiBadge
      key={badge.id}
      className="embPanel__headerBadge"
      iconType={badge.getIconType({ embeddable, trigger: panelBadgeTrigger })}
      onClick={() => badge.execute({ embeddable, trigger: panelBadgeTrigger })}
      // @ts-expect-error TS2322 TODO(ts-error): fixme
      onClickAriaLabel={badge.getDisplayName({ embeddable, trigger: panelBadgeTrigger })}
    >
      {badge.getDisplayName({ embeddable, trigger: panelBadgeTrigger })}
    </EuiBadge>
  ));
}

function renderNotifications(
  notifications: Array<Action<EmbeddableContext>>,
  embeddable: IEmbeddable
) {
  return notifications.map((notification) => {
    const context = { embeddable };

    let badge = notification.MenuItem ? (
      React.createElement(uiToReactComponent(notification.MenuItem))
    ) : (
      <EuiNotificationBadge
        data-test-subj={`embeddablePanelNotification-${notification.id}`}
        key={notification.id}
        style={{ marginTop: '4px', marginRight: '4px' }}
        onClick={() => notification.execute({ ...context, trigger: panelNotificationTrigger })}
      >
        {notification.getDisplayName({ ...context, trigger: panelNotificationTrigger })}
      </EuiNotificationBadge>
    );

    if (notification.getDisplayNameTooltip) {
      const tooltip = notification.getDisplayNameTooltip({
        ...context,
        trigger: panelNotificationTrigger,
      });

      if (tooltip) {
        badge = (
          <EuiToolTip position="top" delay="regular" content={tooltip} key={notification.id}>
            {badge}
          </EuiToolTip>
        );
      }
    }

    return badge;
  });
}

type EmbeddableWithDescription = IEmbeddable & { getDescription: () => string };

function getViewDescription(embeddable: IEmbeddable | EmbeddableWithDescription) {
  if ('getDescription' in embeddable) {
    const description = embeddable.getDescription();

    if (description) {
      return description;
    }
  }

  return '';
}

export function PanelHeader({
  title,
  isViewMode,
  hidePanelTitle,
  hidePanelAction,
  getActionContextMenuPanel,
  closeContextMenu,
  badges,
  notifications,
  embeddable,
  headerId,
}: PanelHeaderProps) {
  const description = getViewDescription(embeddable);
  const showTitle = !hidePanelTitle && (!isViewMode || title);
  const showPanelBar =
    !isViewMode || badges.length > 0 || notifications.length > 0 || showTitle || description;
  const classes = classNames('embPanel__header', {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'embPanel__header--floater': !showPanelBar,
  });
  const placeholderTitle = i18n.translate('embeddableApi.panel.placeholderTitle', {
    defaultMessage: '[No Title]',
  });

  const getAriaLabel = () => {
    return (
      <span id={headerId}>
        {showPanelBar && title
          ? i18n.translate('embeddableApi.panel.enhancedDashboardPanelAriaLabel', {
              defaultMessage: 'Dashboard panel: {title}',
              values: { title: title || placeholderTitle },
            })
          : i18n.translate('embeddableApi.panel.dashboardPanelAriaLabel', {
              defaultMessage: 'Dashboard panel',
            })}
      </span>
    );
  };

  if (!showPanelBar) {
    return (
      <div className={classes}>
        {!hidePanelAction && (
          <PanelOptionsMenu
            getActionContextMenuPanel={getActionContextMenuPanel}
            isViewMode={isViewMode}
            closeContextMenu={closeContextMenu}
            title={title}
          />
        )}
        <EuiScreenReaderOnly>{getAriaLabel()}</EuiScreenReaderOnly>
      </div>
    );
  }

  const renderTitle = () => {
    const titleComponent = showTitle ? (
      <span className={title ? 'embPanel__titleText' : 'embPanel__placeholderTitleText'}>
        {title || placeholderTitle}
      </span>
    ) : undefined;
    return description ? (
      <EuiToolTip
        content={description}
        delay="regular"
        position="top"
        anchorClassName="embPanel__titleTooltipAnchor"
      >
        <span className="embPanel__titleInner">
          {titleComponent} <EuiIcon type="iInCircle" color="subdued" />
        </span>
      </EuiToolTip>
    ) : (
      <span className="embPanel__titleInner">{titleComponent}</span>
    );
  };

  return (
    <figcaption
      className={classes}
      data-test-subj={`embeddablePanelHeading-${(title || '').replace(/\s/g, '')}`}
    >
      <h2 data-test-subj="dashboardPanelTitle" className="embPanel__title embPanel__dragger">
        <EuiScreenReaderOnly>{getAriaLabel()}</EuiScreenReaderOnly>
        {renderTitle()}
        {renderBadges(badges, embeddable)}
      </h2>
      {renderNotifications(notifications, embeddable)}
      {!hidePanelAction && (
        <PanelOptionsMenu
          isViewMode={isViewMode}
          getActionContextMenuPanel={getActionContextMenuPanel}
          closeContextMenu={closeContextMenu}
          title={title}
        />
      )}
    </figcaption>
  );
}
