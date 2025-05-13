import { pgTable, text, serial, integer, boolean, timestamp, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // Admin, Project Manager, Data Analyst, Field Assessor, Viewer
  email: text("email"),
  phone: text("phone"),
  status: text("status").default("active").notNull(), // active, inactive, suspended
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users)
  .omit({ 
    id: true,
    lastLogin: true,
    createdAt: true,
    updatedAt: true,
    status: true
  })
  .extend({
    password: z.string().min(6, "Password must be at least 6 characters"),
    email: z.string().email("Invalid email format").nullable(),
    role: z.enum(["Admin", "Project Manager", "Data Analyst", "Field Assessor", "Viewer"], {
      required_error: "Role is required"
    })
  });

// Site model
export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  siteId: text("site_id").notNull().unique(), // Custom ID (e.g., CLC-001)
  name: text("name").notNull(),
  type: text("type").notNull(), // CLC, Satellite, Operational
  district: text("district").notNull(),
  physicalAddress: text("physical_address"),
  gpsLat: real("gps_lat"),
  gpsLng: real("gps_lng"),
  hostDepartment: text("host_department"),
  agreementType: text("agreement_type"), // Owned, Rented, Partnership
  agreementDetails: text("agreement_details"),
  contractNumber: text("contract_number"),
  contractTerm: text("contract_term"),
  renewalDate: text("renewal_date"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  establishmentDate: text("establishment_date"),
  operationalStatus: text("operational_status").notNull(), // Active, Inactive, Planned
  assessmentStatus: text("assessment_status").notNull(), // To Visit, Visited, Data Verified
  
  // Infrastructure details
  totalArea: integer("total_area"), // square meters
  classrooms: integer("classrooms"),
  offices: integer("offices"),
  computerLabs: integer("computer_labs"),
  workshops: integer("workshops"),
  hasLibrary: boolean("has_library"),
  hasStudentCommonAreas: boolean("has_student_common_areas"),
  hasStaffFacilities: boolean("has_staff_facilities"),
  accessibilityFeatures: text("accessibility_features"),
  internetConnectivity: text("internet_connectivity"),
  securityFeatures: text("security_features"),
  
  // Condition assessment
  buildingCondition: text("building_condition"), // Good, Fair, Poor, Critical
  electricalCondition: text("electrical_condition"),
  plumbingCondition: text("plumbing_condition"),
  interiorCondition: text("interior_condition"),
  exteriorCondition: text("exterior_condition"),
  lastRenovationDate: text("last_renovation_date"),
  
  notes: text("notes"),
  images: json("images").$type<string[]>(),
  createdBy: integer("created_by").references(() => users.id),
  lastVisitedBy: integer("last_visited_by").references(() => users.id),
  lastVisitDate: timestamp("last_visit_date"),
});

export const insertSiteSchema = createInsertSchema(sites).omit({ 
  id: true
  // createdBy: true, // Allow createdBy to be part of InsertSite
  // lastVisitedBy: true // Allow lastVisitedBy to be part of InsertSite
});

// Staff model
export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  staffId: text("staff_id").notNull().unique(), // Custom ID (e.g., STAFF-001)
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  position: text("position"),
  email: text("email"),
  phone: text("phone"),
  verified: boolean("verified").default(false),
  qualifications: json("qualifications").$type<string[]>(),
  skills: json("skills").$type<string[]>(),
  workload: integer("workload"), // Hours per week
  siteId: integer("site_id").references(() => sites.id),
  department: text("department"), // Department or division
  startDate: text("start_date"), // Employment start date
  contractEndDate: text("contract_end_date"), // Contract end date for non-permanent staff
  employmentStatus: text("employment_status"), // Permanent, Contract, etc
  notes: text("notes"), // Additional notes about the staff member
});

export const insertStaffSchema = createInsertSchema(staff).omit({ 
  id: true 
});

// Asset model
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  assetId: text("asset_id").notNull().unique(), // Custom ID (e.g., ASSET-001)
  name: text("name").notNull(),
  type: text("type"), // NEW: Asset Type
  category: text("category").notNull(),
  manufacturer: text("manufacturer"), // NEW
  model: text("model"), // NEW
  serialNumbers: json("serial_numbers").$type<string[]>().default([]).notNull(),
  purchaseDate: text("purchase_date"), // NEW
  purchasePrice: text("purchase_price"), // NEW (use text for simplicity, or real if you want numeric)
  location: text("location"), // NEW
  assignedTo: text("assigned_to"), // NEW
  lastMaintenanceDate: text("last_maintenance_date"), // NEW
  nextMaintenanceDate: text("next_maintenance_date"), // NEW
  description: text("description"),
  condition: text("condition").notNull(), // Good, Fair, Poor, Critical
  acquisitionDate: text("acquisition_date"),
  lastServiceDate: text("last_service_date"),
  notes: text("notes"),
  images: json("images").$type<string[]>(),
  siteId: integer("site_id").references(() => sites.id),
});

// In your migration script, add the following SQL for the new columns:
// You can use a migration tool or run this SQL directly if using PostgreSQL
// Example for PostgreSQL:
//
// ALTER TABLE assets
//   ADD COLUMN type TEXT,
//   ADD COLUMN manufacturer TEXT,
//   ADD COLUMN model TEXT,
//   ADD COLUMN serial_number TEXT,
//   ADD COLUMN purchase_date TEXT,
//   ADD COLUMN purchase_price TEXT,
//   ADD COLUMN location TEXT,
//   ADD COLUMN assigned_to TEXT,
//   ADD COLUMN last_maintenance_date TEXT,
//   ADD COLUMN next_maintenance_date TEXT;
//
// If you use Drizzle Kit, generate and run a migration after updating schema.ts:
// npx drizzle-kit generate:pg
// npx drizzle-kit push:pg
//
// If you use another migration tool, add the above columns to your migration file.
//
// After migration, restart your backend and test asset creation and viewing again.

export const insertAssetSchema = createInsertSchema(assets).omit({ 
  id: true 
});

// Program model
export const programs = pgTable("programs", {
  id: serial("id").primaryKey(),
  programId: text("program_id").notNull().unique(), // Custom ID (e.g., PROG-001)
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  enrollmentCount: integer("enrollment_count"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status").notNull(), // Active, Inactive, Planned
  notes: text("notes"),
  siteId: integer("site_id").references(() => sites.id),
});

export const insertProgramSchema = createInsertSchema(programs).omit({ 
  id: true 
});

// Activity model - for tracking recent activities
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // site_visit, data_verification, photo_upload, etc.
  description: text("description").notNull(),
  relatedEntityId: integer("related_entity_id"), // Site ID, Staff ID, etc.
  relatedEntityType: text("related_entity_type"), // site, staff, asset, program
  performedBy: integer("performed_by").references(() => users.id),
  timestamp: timestamp("timestamp").defaultNow(),
  metadata: json("metadata").$type<Record<string, any>>(), // For storing additional data like priority, category, status
});

export const insertActivitySchema = createInsertSchema(activities).omit({ 
  id: true,
  timestamp: true
});

// District model
export const districts = pgTable("districts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone")
});

export const insertDistrictSchema = createInsertSchema(districts).omit({ 
  id: true 
});

// Define export types for all schemas
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;

export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staff.$inferSelect;

export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programs.$inferSelect;

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect & {
  metadata?: {
    priority?: string;
    category?: string;
    status?: string;
    [key: string]: any;
  };
};

export type District = typeof districts.$inferSelect;
export type InsertDistrict = z.infer<typeof insertDistrictSchema>;
