import account from "./account";
import admin from "./admin";
import analysis from "./analysis";
import api from "./api";
import common from "./common";
import education from "./education";
import fire from "./fire";
import portfolio from "./portfolio";
import today from "./today";

/** All Armenian text, merged from one file per area of the app. */
export const hy: Record<string, string> = {
  ...common,
  ...portfolio,
  ...fire,
  ...analysis,
  ...account,
  ...admin,
  ...education,
  ...api,
  ...today,
};
