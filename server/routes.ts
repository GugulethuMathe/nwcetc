import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import https from 'https';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url'; // Import fileURLToPath
import { storage } from "./storage";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt'; // For comparing password in login, though MySQLStorage handles hashing.
import { insertSiteSchema, insertStaffSchema, insertAssetSchema, insertProgramSchema, insertActivitySchema, insertDistrictSchema, type Site, insertUserSchema, type User, type InsertUser } from "@shared/schema"; // Added InsertUser
import { z } from "zod";

// --- Multer Configuration ---
// Get current directory in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'assets'); // Use derived __dirname

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)){
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR); // Save files to the defined directory
  },
  filename: (req, file, cb) => {
    // Get the original filename and extension
    const originalName = file.originalname;
    const ext = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, ext);
    
    // Add timestamp to ensure uniqueness while preserving original name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const finalName = `${nameWithoutExt}-${uniqueSuffix}${ext}`;
    
    cb(null, finalName);
  }
});

const upload = multer({ storage: multerStorage });
// --- End Multer Configuration ---

const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-secret-key'; // Store this in .env
if (JWT_SECRET === 'your-very-strong-secret-key') {
  console.warn('WARNING: JWT_SECRET is not set in environment variables. Using default insecure key.');
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth endpoints
  // app.post("/api/auth/register", async (req: Request, res: Response) => {
//    try { // FIX: Commented out this line
//       const validatedData = insertUserSchema.omit({ role: true }).extend({
//         role: z.string().optional().default('Viewer') // Default role to 'Viewer'
//       }).parse(req.body);
// 
//       const existingUser = await storage.getUserByUsername(validatedData.username);
//       if (existingUser) {
//         return res.status(409).json({ message: "Username already exists" });
//       }
// 
//       // Explicitly hash password here before sending to storage.createUser if not handled there
//       // MySQLStorage.createUser now handles hashing, so this is okay.
//       const newUser = await storage.createUser(validatedData as any); // Cast as any because role is now optional with default
//       
//       // Exclude password from the response
//       const { password, ...userWithoutPassword } = newUser;
//       res.status(201).json(userWithoutPassword);
//     } catch (error) {
//       if (error instanceof z.ZodError) {
//         return res.status(400).json({ message: "Validation error", errors: error.errors });
//       }
//       console.error("Registration error:", error);
//       res.status(500).json({ message: "Failed to register user", error: error instanceof Error ? error.message : "Unknown error" });
//     }
//   });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      if (user.status === 'suspended') {
        return res.status(403).json({ message: "Account is suspended. Please contact administrator." });
      }

      if (user.status === 'inactive') {
        return res.status(403).json({ message: "Account is inactive. Please contact administrator." });
      }

      const isPasswordValid = await storage.verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Update last login time
      await storage.updateLastLogin(user.id);

      const { password: _, ...userWithoutPassword } = user;

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({ 
        message: "Login successful", 
        token,
        user: userWithoutPassword 
      });

    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ 
        message: "Login failed", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // User Management Endpoints (Protected - for Admins)
  // TODO: Add authentication and authorization middleware (e.g., checkUserRole(['Admin'])) to protect these user management routes
  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);

      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      // Password will be hashed by storage.createUser based on current implementation
      const newUser = await storage.createUser(validatedData);

      const { password, ...userWithoutPassword } = newUser;
      res.status(201).json({ message: "User created successfully", user: userWithoutPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("User creation error:", error);
      res.status(500).json({ message: "Failed to create user", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users", async (req: Request, res: Response) => {
    // TODO: Add authentication and authorization middleware
    try {
      const allUsers = await storage.getAllUsers(); // Assuming storage.getAllUsers() exists
      res.json(allUsers.map(({ password, ...userWithoutPassword }) => userWithoutPassword));
    } catch (error) {
      console.error("Get all users error:", error);
      res.status(500).json({ message: "Failed to fetch users", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:id", async (req: Request, res: Response) => {
    // TODO: Add authentication and authorization middleware
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      const user = await storage.getUserById(userId); // Assuming storage.getUserById() exists
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get user by ID error:", error);
      res.status(500).json({ message: "Failed to fetch user", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.patch("/api/users/:id", async (req: Request, res: Response) => {
    // TODO: Add authentication and authorization middleware
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Validate only parts of the schema that are updatable and don't require password unless it's being changed
      const validatedData = insertUserSchema.partial().parse(req.body);
      
      // If password is in validatedData and is not an empty string, it means it's being updated.
      // The storage.updateUser method should handle hashing if a new password is provided.
      if (validatedData.password === '') {
        delete validatedData.password; // Don't update password if it's an empty string
      }

      const updatedUser = await storage.updateUser(userId, validatedData); // Assuming storage.updateUser() exists
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found or update failed" });
      }
      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ message: "User updated successfully", user: userWithoutPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("User update error:", error);
      res.status(500).json({ message: "Failed to update user", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.delete("/api/users/:id", async (req: Request, res: Response) => {
    // TODO: Add authentication and authorization middleware
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      // Optional: Prevent users from deleting themselves, or super admin from being deleted
      // const requestingUserId = (req as any).user?.id; // Assuming user ID is available from auth middleware
      // if (userId === requestingUserId) {
      //   return res.status(403).json({ message: "Cannot delete your own account." });
      // }

      const success = await storage.deleteUser(userId); // Assuming storage.deleteUser() exists and returns boolean
      if (!success) {
        return res.status(404).json({ message: "User not found or delete failed" });
      }
      res.status(200).json({ message: "User deleted successfully" }); // Or 204 No Content
    } catch (error) {
      console.error("User deletion error:", error);
      res.status(500).json({ message: "Failed to delete user", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const isPasswordValid = await storage.verifyPassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const { password: _, ...userWithoutPassword } = user;

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({ 
        message: "Login successful", 
        token,
        user: userWithoutPassword 
      });

    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ 
        message: "Login failed", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Middleware to protect routes (example)
  // const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  //   const authHeader = req.headers['authorization'];
  //   const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  //   if (token == null) return res.sendStatus(401); // if there isn't any token

  //   jwt.verify(token, JWT_SECRET as string, (err: any, user: any) => {
  //     if (err) return res.sendStatus(403); // if token is no longer valid
  //     (req as any).user = user;
  //     next(); // pass the execution off to whatever request the client intended
  //   });
  // };

  // Example of a protected route:
  // app.get('/api/protected-resource', authenticateToken, (req, res) => {
  //   res.json({ message: 'This is a protected resource!', user: (req as any).user });
  // });

  // prefix all routes with /api
  // prefix all routes with /api

  // District endpoints
  app.get("/api/districts", async (req, res) => {
    try {
      const districts = await storage.getAllDistricts(); // Assumes storage.getAllDistricts exists
      res.json(districts);
    } catch (error) {
      console.error("Error fetching districts:", error);
      res.status(500).json({
        message: "Failed to fetch districts",
        error: error instanceof Error ? error.message : String(error),
        detail: error instanceof Error ? error.stack : undefined
      });
    }
  });

  app.get("/api/districts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const district = await storage.getDistrict(id); // Assumes storage.getDistrict exists

      if (!district) {
        return res.status(404).json({ message: "District not found" });
      }

      res.json(district);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch district", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/districts", async (req, res) => {
    try {
      const validatedData = insertDistrictSchema.parse(req.body);
      const newDistrict = await storage.createDistrict(validatedData); // Assumes storage.createDistrict exists
      res.status(201).json(newDistrict);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create district", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.patch("/api/districts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingDistrict = await storage.getDistrict(id); // Assumes storage.getDistrict exists

      if (!existingDistrict) {
        return res.status(404).json({ message: "District not found" });
      }

      const validatedData = insertDistrictSchema.partial().parse(req.body);
      const updatedDistrict = await storage.updateDistrict(id, validatedData); // Assumes storage.updateDistrict exists
      res.json(updatedDistrict);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update district", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.delete("/api/districts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingDistrict = await storage.getDistrict(id); // Assumes storage.getDistrict exists

      if (!existingDistrict) {
        return res.status(404).json({ message: "District not found" });
      }

      // Optional: Check if any sites are linked to this district before deleting
      // const sitesInDistrict = await storage.getSitesByDistrict(id); // Assumes storage.getSitesByDistrict exists
      // if (sitesInDistrict.length > 0) {
      //   return res.status(400).json({ message: "Cannot delete district with associated sites." });
      // }

      await storage.deleteDistrict(id); // Assumes storage.deleteDistrict exists
      res.status(204).send(); // No content on successful deletion
    } catch (error) {
      res.status(500).json({ message: "Failed to delete district", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Sites endpoints
  // Removed duplicate block start and comment
  // --- User Management API Routes ---
  // Placeholder for authorization middleware
  const isAdminOrSelf = (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore // TODO: Properly type or access user from session/token
    const loggedInUser = req.user;
    const targetUserId = req.params.id ? parseInt(req.params.id, 10) : null;

    // @ts-ignore
    if (loggedInUser && loggedInUser.role === 'Admin') {
      return next(); // Admins can do anything
    }
    // @ts-ignore
    if (loggedInUser && targetUserId && loggedInUser.id === targetUserId && (req.method === 'GET' || req.method === 'PATCH')) {
      return next(); // Users can view or update their own profiles
    }
    console.warn("User routes are currently not fully protected by role-based authorization. This is a temporary measure for development and needs to be secured.");
    // @ts-ignore
    if (loggedInUser) return next(); // TEMPORARY: Allow any logged-in user for other actions for now
    // Fallback to allow if no specific restriction met - VERY PERMISSIVE FOR DEV
    // In a production environment, this should default to forbidden if no explicit allow rule is met.
    // return res.status(403).json({ message: 'Forbidden: Insufficient permissions' }); 
    next(); 
  };

  // GET all users
  app.get("/api/users", isAdminOrSelf, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Exclude password field from the response
      res.json(users.map(u => { const { password, ...userWithoutPassword } = u; return userWithoutPassword; }));
    } catch (error) {
      console.error("Failed to get all users:", error);
      res.status(500).json({ message: (error as Error).message });
    }
  });

  // GET a single user by ID
  app.get("/api/users/:id", isAdminOrSelf, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      const user = await storage.getUser(id);
      if (user) {
        const { password, ...userWithoutPassword } = user; // Exclude password
        res.json(userWithoutPassword);
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      console.error(`Failed to get user ${req.params.id}:`, error);
      res.status(500).json({ message: (error as Error).message });
    }
  });

  // POST (create) a new user
  app.post("/api/users", isAdminOrSelf, async (req, res) => {
    try {
      const validation = insertUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid user data", errors: validation.error.format() });
      }
      const newUser = await storage.createUser(validation.data as InsertUser);
      const { password, ...userWithoutPassword } = newUser; // Exclude password
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error("Failed to create user:", error);
      if ((error as any).code === 'ER_DUP_ENTRY') { // Handle unique constraint errors (e.g., username exists)
        return res.status(409).json({ message: 'Username or email already exists.' });
      }
      res.status(500).json({ message: (error as Error).message });
    }
  });

  // PATCH (update) a user by ID
  app.patch("/api/users/:id", isAdminOrSelf, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      const userData = { ...req.body };
      // If password field is present and empty, null, or undefined, remove it so it's not updated
      if (userData.password === '' || userData.password === null || userData.password === undefined) {
        delete userData.password;
      }
      // Add more specific validation for partial updates if needed using a partial schema
      const updatedUser = await storage.updateUser(id, userData as Partial<InsertUser>);
      const { password, ...userWithoutPassword } = updatedUser; // Exclude password
      res.json(userWithoutPassword);
    } catch (error) {
      console.error(`Failed to update user ${req.params.id}:`, error);
      if ((error as Error).message.includes("not found")) {
        return res.status(404).json({ message: (error as Error).message });
      }
      if ((error as any).code === 'ER_DUP_ENTRY') { // Handle unique constraint errors
        return res.status(409).json({ message: 'Username or email already exists for another user.' });
      }
      res.status(500).json({ message: (error as Error).message });
    }
  });

  // DELETE a user by ID
  app.delete("/api/users/:id", isAdminOrSelf, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      // @ts-ignore // TODO: Prevent self-deletion if not desired, e.g., if (req.user && req.user.id === id)
      const success = await storage.deleteUser(id);
      if (success) {
        res.status(204).send(); // No content
      } else {
        res.status(404).json({ message: "User not found or could not be deleted" });
      }
    } catch (error) {
      console.error(`Failed to delete user ${req.params.id}:`, error);
      res.status(500).json({ message: (error as Error).message });
    }
  });

  // --- End User Management API Routes ---

app.get("/api/sites", async (req, res) => {
    try {
      const sites = await storage.getAllSites();
      res.json(sites);
    } catch (error) {
      console.error("Error fetching sites:", error);
      res.status(500).json({
        message: "Failed to fetch sites",
        error: error instanceof Error ? error.message : String(error),
        detail: error instanceof Error ? error.stack : undefined
      });
    }
  });

  app.get("/api/sites/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if id is a valid number
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid site ID. Site ID must be a number." });
      }
      
      const site = await storage.getSite(id);
      
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }
      
      res.json(site);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch site", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/sites", async (req, res) => {
    try {
      const validatedData = insertSiteSchema.parse(req.body);
      
      // Remove districtId check since we use district name directly
      const newSite = await storage.createSite(validatedData);
      
      // Create activity log for the new site
      await storage.createActivity({
        type: "site_creation",
        description: `Created new site: ${newSite.name}`,
        relatedEntityId: newSite.id,
        relatedEntityType: "site",
        performedBy: req.body.createdBy || 1, // Default to user 1 if not specified
      });
      
      res.status(201).json(newSite);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Site creation error:", error);
      res.status(500).json({ message: "Failed to create site", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.patch("/api/sites/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingSite = await storage.getSite(id);
      
      if (!existingSite) {
        return res.status(404).json({ message: "Site not found" });
      }

      const validatedData = insertSiteSchema.partial().parse(req.body);

      // Get user ID from request context (assuming middleware adds it) or default
      const performingUserId = (req as any).user?.id || 1; // Example placeholder

      // Update the site using validated data and adding visit info
      // Use type assertion as Partial<InsertSite> is slightly different from Partial<Site>
      const finalUpdatedSite = await storage.updateSite(id, {
          ...validatedData, // Spread validated data
          lastVisitedBy: performingUserId,
          lastVisitDate: new Date()
      } as Partial<Site>); // Assert type

      // Create activity log for the update
      await storage.createActivity({
        type: "site_update",
        description: `Updated site: ${finalUpdatedSite.name}`, // Use final name
        relatedEntityId: finalUpdatedSite.id,
        relatedEntityType: "site",
        performedBy: performingUserId, // Use the actual user ID
      });

      res.json(finalUpdatedSite); // Return the site state after all updates
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update site", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Staff endpoints
  app.get("/api/staff", async (req, res) => {
    try {
      const staff = await storage.getAllStaff();
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/sites/:siteId/staff", async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const staff = await storage.getStaffBySite(siteId);
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff for site", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/staff/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const staffMember = await storage.getStaff(id);
      
      if (!staffMember) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      
      res.json(staffMember);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff member", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/staff", async (req, res) => {
    try {
      const validatedData = insertStaffSchema.parse(req.body);
      const newStaff = await storage.createStaff(validatedData);
      
      // Create activity log
      await storage.createActivity({
        type: "staff_creation",
        description: `Added new staff member: ${newStaff.firstName} ${newStaff.lastName}`,
        relatedEntityId: newStaff.id,
        relatedEntityType: "staff",
        performedBy: 1, // Default to user 1
      });
      
      res.status(201).json(newStaff);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create staff member", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Asset endpoints
  app.get("/api/assets", async (req, res) => {
    try {
      const assets = await storage.getAllAssets();
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assets", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/sites/:siteId/assets", async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const assets = await storage.getAssetsBySite(siteId);
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assets for site", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/assets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const asset = await storage.getAsset(id);
      
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }
      
      res.json(asset);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch asset", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/assets", async (req, res) => {
    try {
      const validatedData = insertAssetSchema.parse(req.body);
      const newAsset = await storage.createAsset(validatedData);
      
      // Create activity log
      await storage.createActivity({
        type: "asset_creation",
        description: `Added new asset: ${newAsset.name}`,
        relatedEntityId: newAsset.id,
        relatedEntityType: "asset",
        performedBy: 1, // Default to user 1
      });
      
      res.status(201).json(newAsset);
    } catch (error) {
      console.error("Error in POST /api/assets:", error); // Add detailed logging
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      // Log the specific error before sending a generic 500 response
      res.status(500).json({ message: "Failed to create asset", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.patch("/api/assets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingAsset = await storage.getAsset(id);

      if (!existingAsset) {
        return res.status(404).json({ message: "Asset not found" });
      }

      // Use partial schema for updates, allowing any subset of fields
      const validatedData = insertAssetSchema.partial().parse(req.body);
      const updatedAsset = await storage.updateAsset(id, validatedData);

      // Create activity log
      await storage.createActivity({
        type: "asset_update",
        description: `Updated asset: ${updatedAsset.name}`,
        relatedEntityId: updatedAsset.id,
        relatedEntityType: "asset",
        performedBy: 1, // Default to user 1 (replace with actual user ID from auth)
      });

      res.json(updatedAsset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update asset", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Program endpoints
  app.get("/api/programs", async (req, res) => {
    try {
      const programs = await storage.getAllPrograms();
      res.json(programs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch programs", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/sites/:siteId/programs", async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const programs = await storage.getProgramsBySite(siteId);
      res.json(programs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch programs for site", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/programs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const program = await storage.getProgram(id);
      
      if (!program) {
        return res.status(404).json({ message: "Program not found" });
      }
      
      res.json(program);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch program", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/programs", async (req, res) => {
    try {
      const validatedData = insertProgramSchema.parse(req.body);
      const newProgram = await storage.createProgram(validatedData);
      
      // Create activity log
      await storage.createActivity({
        type: "program_creation",
        description: `Added new program: ${newProgram.name}`,
        relatedEntityId: newProgram.id,
        relatedEntityType: "program",
        performedBy: 1, // Default to user 1
      });
      
      res.status(201).json(newProgram);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create program", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Activity endpoints
  app.get("/api/activities", async (req, res) => {
    try {
      const activities = await storage.getAllActivities();
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({
        message: "Failed to fetch activities",
        error: error instanceof Error ? error.message : String(error),
        detail: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Get activities by site ID
  app.get("/api/sites/:siteId/activities", async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const activities = await storage.getAllActivities();
      
      // Filter activities related to the specified site
      const siteActivities = activities.filter(
        activity => activity.relatedEntityType === "site" && activity.relatedEntityId === siteId
      );
      
      // Sort by timestamp in descending order (newest first)
      siteActivities.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      res.json(siteActivities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activities for site", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      const validatedData = insertActivitySchema.parse(req.body);
      const newActivity = await storage.createActivity(validatedData);
      res.status(201).json(newActivity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create activity", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Update activity endpoint (for recommendation status updates)
  app.patch("/api/activities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingActivity = await storage.getActivity(id);
      
      if (!existingActivity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // Merge existing metadata with new metadata
      const currentMetadata = existingActivity.metadata || {};
      const newMetadata = req.body.metadata || {};
      const mergedMetadata = { ...currentMetadata, ...newMetadata };

      // Update the activity with the merged metadata
      const updatedActivity = await storage.updateActivity(id, {
        ...req.body,
        metadata: mergedMetadata
      });

      res.json(updatedActivity);
    } catch (error) {
      console.error("Error updating activity:", error);
      res.status(500).json({ message: "Failed to update activity", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Delete activity endpoint (for removing recommendations)
  app.delete("/api/activities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existingActivity = await storage.getActivity(id);
      
      if (!existingActivity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      // Delete the activity
      await storage.deleteActivity(id);

      res.status(204).send(); // No content on successful deletion
    } catch (error) {
      console.error("Error deleting activity:", error);
      res.status(500).json({ message: "Failed to delete activity", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Updated Upload images endpoint using multer
  // Handles multiple files uploaded under the field name 'files'
  app.post("/api/upload", upload.array('files'), (req, res) => {
    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ message: "No files uploaded." });
      }

      // Map uploaded files to their relative paths
      const files = req.files as Express.Multer.File[];
      const urls = files.map(file => `/uploads/assets/${file.filename}`); // Construct relative URL path

      res.status(201).json({
        message: "Upload successful",
        urls: urls // Return the actual relative URLs
      });
    } catch (error) {
       console.error("File upload error:", error);
       res.status(500).json({ message: "File upload failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Site image upload endpoint
  app.post("/api/sites/:siteId/images", upload.array('files'), async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const site = await storage.getSite(siteId);
      
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ message: "No files uploaded." });
      }

      // Map uploaded files to their relative paths
      const files = req.files as Express.Multer.File[];
      const newImageUrls = files.map(file => `/uploads/assets/${file.filename}`);
      
      // Update site with new images
      const currentImages = site.images || [];
      const updatedSite = await storage.updateSite(siteId, {
        images: [...currentImages, ...newImageUrls]
      });

      // Create activity log for the image upload
      await storage.createActivity({
        type: "photo_upload",
        description: `Uploaded ${newImageUrls.length} new image(s) for ${site.name}`,
        relatedEntityId: siteId,
        relatedEntityType: "site",
        performedBy: 1, // Default to user 1 (replace with actual user ID from auth)
      });

      res.status(201).json({
        message: "Images uploaded successfully",
        site: updatedSite
      });
    } catch (error) {
      console.error("Site image upload error:", error);
      res.status(500).json({ message: "Image upload failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Delete site image endpoint
  app.delete("/api/sites/:siteId/images/:imageIndex", async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const imageIndex = parseInt(req.params.imageIndex);
      
      const site = await storage.getSite(siteId);
      
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }

      if (!site.images || site.images.length === 0) {
        return res.status(404).json({ message: "Site has no images" });
      }

      if (imageIndex < 0 || imageIndex >= site.images.length) {
        return res.status(400).json({ message: "Invalid image index" });
      }

      // Get the image URL to be removed
      const imageToRemove = site.images[imageIndex];
      
      // Remove the image from the array
      const updatedImages = [...site.images];
      updatedImages.splice(imageIndex, 1);
      
      // Update the site with the new images array
      const updatedSite = await storage.updateSite(siteId, {
        images: updatedImages
      });

      // Create activity log for the image deletion
      await storage.createActivity({
        type: "photo_delete",
        description: `Removed image from ${site.name}`,
        relatedEntityId: siteId,
        relatedEntityType: "site",
        performedBy: 1, // Default to user 1 (replace with actual user ID from auth)
      });

      // Optionally, delete the actual file from the filesystem
      // This is commented out for safety, but could be implemented if needed
      // const filePath = path.join(__dirname, '..', 'public', imageToRemove);
      // if (fs.existsSync(filePath)) {
      //   fs.unlinkSync(filePath);
      // }

      res.json({
        message: "Image removed successfully",
        site: updatedSite
      });
    } catch (error) {
      console.error("Site image deletion error:", error);
      res.status(500).json({ message: "Failed to remove image", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Site document upload endpoint
  app.post("/api/sites/:siteId/documents", upload.array('files'), async (req, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const site = await storage.getSite(siteId);
      
      if (!site) {
        return res.status(404).json({ message: "Site not found" });
      }

      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ message: "No files uploaded." });
      }

      // Map uploaded files to their relative paths
      const files = req.files as Express.Multer.File[];
      const newDocUrls = files.map(file => `/uploads/assets/${file.filename}`);
      
      // Update site with new documents
      const currentImages = site.images || [];
      const updatedSite = await storage.updateSite(siteId, {
        images: [...currentImages, ...newDocUrls]
      });

      // Create activity log for the document upload
      await storage.createActivity({
        type: "document_upload",
        description: `Uploaded ${newDocUrls.length} new document(s) for ${site.name}`,
        relatedEntityId: siteId,
        relatedEntityType: "site",
        performedBy: 1, // Default to user 1 (replace with actual user ID from auth)
      });

      res.status(201).json({
        message: "Documents uploaded successfully",
        urls: newDocUrls,
        site: updatedSite
      });
    } catch (error) {
      console.error("Site document upload error:", error);
      res.status(500).json({ message: "Document upload failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Reverse Geocoding endpoint
  app.get("/api/reverse-geocode", async (req: Request, res: Response) => {
    const { lat, lon } = req.query;

    if (!lat || !lon || isNaN(Number(lat)) || isNaN(Number(lon))) {
      return res.status(400).json({ message: "Invalid or missing latitude/longitude parameters." });
    }

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`;

    const options = {
      headers: {
        'User-Agent': 'CollegeSiteTracker/1.0 (contact@example.com)' // IMPORTANT: Replace with a real contact email
      }
    };

    https.get(nominatimUrl, options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
             console.error("Nominatim API Error:", result.error);
             return res.status(500).json({ message: "Reverse geocoding service error.", error: result.error });
          }
          // Use display_name for a full address string
          const address = result.display_name || "Address not found"; 
          res.json({ address });
        } catch (parseError) {
          console.error("Failed to parse Nominatim response:", parseError);
          res.status(500).json({ message: "Failed to parse reverse geocoding response.", error: parseError instanceof Error ? parseError.message : 'Unknown parse error' });
        }
      });
    }).on('error', (err) => {
      console.error("Error calling Nominatim API:", err);
      res.status(500).json({ message: "Failed to call reverse geocoding service.", error: err.message });
    });
  });

  // User Activity endpoints
  app.get("/api/users/:userId/activities", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const activities = await storage.getAllActivities();
      
      // Filter activities related to the user
      // Include activities where the user is the performer or the target
      const userActivities = activities.filter(activity => 
        activity.performedBy === userId || 
        (activity.relatedEntityType === 'user' && activity.relatedEntityId === userId)
      );
      
      // Sort by timestamp in descending order (newest first)
      userActivities.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      
      res.json(userActivities);
    } catch (error) {
      console.error("Error fetching user activities:", error);
      res.status(500).json({ 
        message: "Failed to fetch user activities", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Log user activity
  app.post("/api/users/:userId/activities", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const { type, description, metadata } = req.body;
      
      const newActivity = await storage.createActivity({
        type,
        description,
        relatedEntityId: userId,
        relatedEntityType: 'user',
        performedBy: req.user?.userId || userId, // Use authenticated user ID if available
        metadata
      });

      res.status(201).json(newActivity);
    } catch (error) {
      console.error("Error creating user activity:", error);
      res.status(500).json({ 
        message: "Failed to create user activity", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}