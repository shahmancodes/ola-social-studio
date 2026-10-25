import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {OlaLaunchFilm,type LaunchProps} from './ola-launch-film';
const defaults:LaunchProps={shots:[],duration:30,base:'',font:'',musicTitle:'',musicArtist:''};
registerRoot(()=><Composition id="OlaLaunch" component={OlaLaunchFilm} width={1920} height={1080} fps={30} durationInFrames={30} defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:props.duration})}/>);
