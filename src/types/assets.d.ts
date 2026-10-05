/**
 * Image files imported from code (`import room from "…/room.jpg"`). Metro turns each into
 * an asset reference that <Image> accepts. Neither Expo nor React Native declares these.
 */
declare module "*.jpg" {
  import type { ImageSourcePropType } from "react-native";
  const source: ImageSourcePropType;
  export default source;
}
declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";
  const source: ImageSourcePropType;
  export default source;
}
