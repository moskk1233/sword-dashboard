import React from 'react';
import ReactDOM from 'react-dom';
import { AppMountParameters, CoreStart } from '../../../src/core/public';
import { SwordApp } from './app';
import { AppPluginStartDependencies } from './types';

export const renderApp = (
  core: CoreStart,
  deps: AppPluginStartDependencies,
  { element, history }: AppMountParameters
) => {
  ReactDOM.render(
    <core.i18n.Context>
      <SwordApp core={core} history={history} />
    </core.i18n.Context>,
    element
  );
  return () => ReactDOM.unmountComponentAtNode(element);
};
