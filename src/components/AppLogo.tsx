import React from 'react';
import Svg, { Path } from 'react-native-svg';

export const AppLogo = ({ width = 78, height = 72 }: { width?: number; height?: number }) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 78 72" fill="none">
      <Path d="M14 24C16 13 25 8 34 15C39 19 44 30 48 42" stroke="#2F7BFF" strokeWidth="6" strokeLinecap="round" />
      <Path d="M64 24C62 13 53 8 44 15C39 19 34 30 30 42" stroke="#FFCC2F" strokeWidth="6" strokeLinecap="round" />
      <Path d="M28 42C31 52 39 58 47 52" stroke="#3BDB80" strokeWidth="6" strokeLinecap="round" />
      <Path d="M30 42C27 52 19 58 11 52" stroke="#FF4F62" strokeWidth="6" strokeLinecap="round" />
    </Svg>
  );
};
