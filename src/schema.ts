import * as v from 'valibot';
import { newCodesBySport, supportedDivisions } from './codes';

const currentYear = new Date().getFullYear();

export const validSports = v.picklist(Object.keys(newCodesBySport), "Invalid sport");

export const validScoreboardSports = v.picklist(Object.keys(newCodesBySport).filter(sport => newCodesBySport[sport]?.code), "Invalid sport");

export const validGameIds = v.pipe(v.string(), v.toNumber(), v.minValue(999999), v.maxValue(99999999));

export const validDivisions = v.picklist(supportedDivisions, "Invalid division");

export const validYears = v.pipe(v.string(), v.toNumber(), v.minValue(2000), v.maxValue(currentYear + 1));