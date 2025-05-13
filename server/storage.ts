import {
  users,
  sites,
  staff,
  assets,
  programs,
  activities,
  type User,
  type InsertUser,
  type Site,
  type InsertSite,
  type Staff,
  type InsertStaff,
  type Asset,
  type InsertAsset,
  type Program,
  type InsertProgram,
  type Activity,
  type InsertActivity,
  type District, // Added District type
  type InsertDistrict, // Added InsertDistrict type
  districts // Added districts table
} from "@shared/schema";

// modify the interface with any CRUD methods
// you might need
export interface IStorage {
  // District management
  getAllDistricts(): Promise<District[]>;
  getDistrict(id: number): Promise<District | undefined>;
  createDistrict(district: InsertDistrict): Promise<District>;
  updateDistrict(id: number, district: Partial<InsertDistrict>): Promise<District>;
  deleteDistrict(id: number): Promise<boolean>;
  // Optional: getSitesByDistrict(districtId: number): Promise<Site[]>;

  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>; // Added
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>; // Added
  deleteUser(id: number): Promise<boolean>; // Added
  verifyPassword(password: string, hash: string): Promise<boolean>;
  getUserById(userId: number): Promise<User | null>;
  updateLastLogin(userId: number): Promise<void>; // Added

  // Site management
  getAllSites(): Promise<Site[]>;
  getSite(id: number): Promise<Site | undefined>;
  createSite(site: InsertSite): Promise<Site>;
  updateSite(id: number, site: Partial<Site>): Promise<Site>; // Use Partial<Site> for updates
  deleteSite(id: number): Promise<boolean>;

  // Staff management
  getAllStaff(): Promise<Staff[]>;
  getStaff(id: number): Promise<Staff | undefined>;
  getStaffBySite(siteId: number): Promise<Staff[]>;
  createStaff(staffMember: InsertStaff): Promise<Staff>;
  updateStaff(id: number, staffMember: Partial<InsertStaff>): Promise<Staff>;
  deleteStaff(id: number): Promise<boolean>;

  // Asset management
  getAllAssets(): Promise<Asset[]>;
  getAsset(id: number): Promise<Asset | undefined>;
  getAssetsBySite(siteId: number): Promise<Asset[]>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: number, asset: Partial<InsertAsset>): Promise<Asset>;
  deleteAsset(id: number): Promise<boolean>;

  // Program management
  getAllPrograms(): Promise<Program[]>;
  getProgram(id: number): Promise<Program | undefined>;
  getProgramsBySite(siteId: number): Promise<Program[]>;
  createProgram(program: InsertProgram): Promise<Program>;
  updateProgram(id: number, program: Partial<InsertProgram>): Promise<Program>;
  deleteProgram(id: number): Promise<boolean>;

  // Activity tracking
  getAllActivities(): Promise<Activity[]>;
  getActivity(id: number): Promise<Activity | undefined>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: number, activity: Partial<Activity>): Promise<Activity>;
  deleteActivity(id: number): Promise<boolean>;
}

// Removed the MemStorage class implementation entirely.
// Removed the conditional export logic.
// The IStorage interface remains as the contract for storage implementations.

import { MySQLStorage } from './MySQLStorage';

export const storage: IStorage = new MySQLStorage();