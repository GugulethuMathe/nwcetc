import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt'; // Make sure bcrypt is installed: npm install bcrypt @types/bcrypt
import {
  // Ensure all necessary types and table definitions are imported
  users,
  sites,
  staff,
  assets,
  programs,
  activities,
  districts,
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
  type District,
  type InsertDistrict,
} from "@shared/schema";
// Corrected import path for the interface:
import { IStorage } from "./storage"; // Corrected import path

export class MySQLStorage implements IStorage {
  private pool: mysql.Pool;

  constructor() {
    // Create a connection pool
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'college_site_tracker',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    console.log("MySQL connection pool created.");
    this.pool.getConnection()
      .then(connection => {
        console.log("Successfully connected to the database.");
        connection.release();
      })
      .catch(err => {
        console.error("!!! Failed to connect to the database: ", err.message);
      });
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Helper method to execute queries
  private async query<T>(sql: string, params: any[] = []): Promise<T> {
    let connection;
    try {
      connection = await this.pool.getConnection();
      const [rows] = await connection.execute(sql, params);
      return rows as T;
    } catch (error) {
      console.error(`Error executing query: ${sql} with params: ${JSON.stringify(params)}`, error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  // --- District Methods ---
  async getAllDistricts(): Promise<District[]> {
    const result = await this.query<any[]>(
      'SELECT id, name, region, contact_person, contact_email, contact_phone FROM districts ORDER BY name'
    );
    return result.map(r => ({
        id: r.id,
        name: r.name,
        region: r.region,
        contactPerson: r.contact_person,
        contactEmail: r.contact_email,
        contactPhone: r.contact_phone,
    }));
  }

  async getDistrict(id: number): Promise<District | undefined> {
    const result = await this.query<any[]>(
      'SELECT id, name, region, contact_person, contact_email, contact_phone FROM districts WHERE id = ? LIMIT 1',
      [id]
    );
    if (result.length === 0) return undefined;
    const r = result[0];
    return {
        id: r.id,
        name: r.name,
        region: r.region,
        contactPerson: r.contact_person,
        contactEmail: r.contact_email,
        contactPhone: r.contact_phone,
    };
  }

  async createDistrict(district: InsertDistrict): Promise<District> {
    const result = await this.query<mysql.ResultSetHeader>(
      `INSERT INTO districts (name, region, contact_person, contact_email, contact_phone)
       VALUES (?, ?, ?, ?, ?)`,
      [
        district.name,
        district.region || null,
        district.contactPerson || null,
        district.contactEmail || null,
        district.contactPhone || null
      ]
    );
    const newDistrict = await this.getDistrict(result.insertId);
    if (!newDistrict) {
      throw new Error('Failed to fetch created district');
    }
    return newDistrict;
  }

  async updateDistrict(id: number, districtUpdate: Partial<InsertDistrict>): Promise<District> {
    const updates: string[] = [];
    const values: any[] = [];

    if (districtUpdate.name !== undefined) { updates.push('name = ?'); values.push(districtUpdate.name); }
    if (districtUpdate.region !== undefined) { updates.push('region = ?'); values.push(districtUpdate.region); }
    if (districtUpdate.contactPerson !== undefined) { updates.push('contact_person = ?'); values.push(districtUpdate.contactPerson); }
    if (districtUpdate.contactEmail !== undefined) { updates.push('contact_email = ?'); values.push(districtUpdate.contactEmail); }
    if (districtUpdate.contactPhone !== undefined) { updates.push('contact_phone = ?'); values.push(districtUpdate.contactPhone); }


    if (updates.length === 0) {
      const existing = await this.getDistrict(id);
      if (!existing) throw new Error(`District with ID ${id} not found`);
      return existing;
    }
    values.push(id);
    await this.query(
      `UPDATE districts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    const updatedDistrict = await this.getDistrict(id);
    if (!updatedDistrict) {
      throw new Error(`District with ID ${id} not found after update`);
    }
    return updatedDistrict;
  }

  async deleteDistrict(id: number): Promise<boolean> {
    const siteCheck = await this.query<any[]>(
      'SELECT COUNT(*) as count FROM sites WHERE district = (SELECT name FROM districts WHERE id = ?)',
      [id]
    );
    if (siteCheck[0].count > 0) {
      // console.warn(`Attempted to delete district ${id} which has associated sites.`);
      throw new Error(`Cannot delete district ${id}: It has associated sites.`);
    }
    const result = await this.query<mysql.ResultSetHeader>(
      'DELETE FROM districts WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  // --- User Methods ---
  async getUser(id: number): Promise<User | undefined> {
    const users = await this.query<any[]>(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    if (users.length === 0) return undefined;
    const u = users[0];
    return {
      id: u.id,
      username: u.username,
      password: u.password,
      name: u.name,
      role: u.role,
      email: u.email,
      phone: u.phone,
      status: u.status || 'active',
      lastLogin: u.last_login ? new Date(u.last_login) : null,
      createdAt: u.created_at ? new Date(u.created_at) : null,
      updatedAt: u.updated_at ? new Date(u.updated_at) : null
    };
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const users = await this.query<any[]>(
      'SELECT * FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (users.length === 0) return undefined;
    const u = users[0];
    return {
      id: u.id,
      username: u.username,
      password: u.password,
      name: u.name,
      role: u.role,
      email: u.email,
      phone: u.phone,
      status: u.status || 'active',
      lastLogin: u.last_login ? new Date(u.last_login) : null,
      createdAt: u.created_at ? new Date(u.created_at) : null,
      updatedAt: u.updated_at ? new Date(u.updated_at) : null
    };
  }

  async getUserById(userId: number): Promise<User | null> {
    const users = await this.query<any[]>(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (users.length === 0) return null;
    const u = users[0];
    return {
      id: u.id,
      username: u.username,
      password: u.password,
      name: u.name,
      role: u.role,
      email: u.email,
      phone: u.phone,
      status: u.status || 'active',
      lastLogin: u.last_login ? new Date(u.last_login) : null,
      createdAt: u.created_at ? new Date(u.created_at) : null,
      updatedAt: u.updated_at ? new Date(u.updated_at) : null
    };
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashedPassword = await this.hashPassword(user.password);
    const result = await this.query<mysql.ResultSetHeader>(
      `INSERT INTO users (
        username, password, name, role, email, phone, 
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        user.username,
        hashedPassword,
        user.name,
        user.role,
        user.email || null,
        user.phone || null
      ]
    );
    const newUser = await this.getUser(result.insertId);
    if (!newUser) {
      throw new Error('Failed to fetch created user');
    }
    return newUser;
  }

  async getAllUsers(): Promise<User[]> {
    const users = await this.query<any[]>(
      'SELECT id, username, name, role, email, phone, status, last_login, created_at, updated_at FROM users ORDER BY name'
    );
    return users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      email: u.email,
      phone: u.phone,
      status: u.status,
      lastLogin: u.last_login,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      password: '' // Password should not be returned
    }));
  }

  async updateUser(id: number, userUpdate: Partial<InsertUser>): Promise<User> {
    const updates: string[] = [];
    const values: any[] = [];

    if (userUpdate.username !== undefined) { updates.push('username = ?'); values.push(userUpdate.username); }
    if (userUpdate.password !== undefined && userUpdate.password !== '') {
      updates.push('password = ?');
      values.push(await this.hashPassword(userUpdate.password));
    }
    if (userUpdate.name !== undefined) { updates.push('name = ?'); values.push(userUpdate.name); }
    if (userUpdate.role !== undefined) { updates.push('role = ?'); values.push(userUpdate.role); }
    if (userUpdate.email !== undefined) { updates.push('email = ?'); values.push(userUpdate.email ?? null); }
    if (userUpdate.phone !== undefined) { updates.push('phone = ?'); values.push(userUpdate.phone ?? null); }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 0) {
      const existingUser = await this.getUser(id);
      if (!existingUser) throw new Error(`User with ID ${id} not found`);
      return existingUser;
    }

    values.push(id);

    await this.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    const updatedUser = await this.getUser(id);
    if (!updatedUser) throw new Error(`User with ID ${id} not found after update`);
    return updatedUser;
  }

  async deleteUser(id: number): Promise<boolean> {
    const result = await this.query<mysql.ResultSetHeader>(
      'DELETE FROM users WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  async updateLastLogin(userId: number): Promise<void> {
    await this.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }

  async updateUserStatus(userId: number, status: 'active' | 'inactive' | 'suspended'): Promise<User> {
    await this.query(
      'UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, userId]
    );
    const updatedUser = await this.getUser(userId);
    if (!updatedUser) throw new Error(`User with ID ${userId} not found after status update`);
    return updatedUser;
  }

  // --- Site Methods ---
  private mapDbRowToSite(dbRow: any): Site {
    return {
        id: dbRow.id,
        siteId: dbRow.site_id,
        name: dbRow.name,
        type: dbRow.type,
        district: dbRow.district,
        physicalAddress: dbRow.physical_address,
        gpsLat: parseFloat(dbRow.gps_lat), // Ensure numbers are parsed
        gpsLng: parseFloat(dbRow.gps_lng),
        hostDepartment: dbRow.host_department,
        agreementType: dbRow.agreement_type,
        agreementDetails: dbRow.agreement_details,
        contractNumber: dbRow.contract_number,
        contractTerm: dbRow.contract_term,
        renewalDate: dbRow.renewal_date || null,
        contactPerson: dbRow.contact_person,
        contactEmail: dbRow.contact_email,
        contactPhone: dbRow.contact_phone,
        establishmentDate: dbRow.establishment_date || null,
        operationalStatus: dbRow.operational_status,
        assessmentStatus: dbRow.assessment_status,
        totalArea: dbRow.total_area ? parseInt(dbRow.total_area, 10) : null,
        classrooms: dbRow.classrooms ? parseInt(dbRow.classrooms, 10) : null,
        offices: dbRow.offices ? parseInt(dbRow.offices, 10) : null,
        computerLabs: dbRow.computer_labs ? parseInt(dbRow.computer_labs, 10) : null,
        workshops: dbRow.workshops ? parseInt(dbRow.workshops, 10) : null,
        hasLibrary: Boolean(dbRow.has_library),
        hasStudentCommonAreas: Boolean(dbRow.has_student_common_areas),
        hasStaffFacilities: Boolean(dbRow.has_staff_facilities),
        accessibilityFeatures: dbRow.accessibility_features,
        internetConnectivity: dbRow.internet_connectivity,
        securityFeatures: dbRow.security_features,
        buildingCondition: dbRow.building_condition,
        electricalCondition: dbRow.electrical_condition,
        plumbingCondition: dbRow.plumbing_condition,
        interiorCondition: dbRow.interior_condition,
        exteriorCondition: dbRow.exterior_condition,
        lastRenovationDate: dbRow.last_renovation_date || null,
        notes: dbRow.notes,
        images: dbRow.images ? JSON.parse(dbRow.images) : [],
        createdBy: dbRow.created_by,
        lastVisitedBy: dbRow.last_visited_by,
        lastVisitDate: dbRow.last_visit_date ? new Date(dbRow.last_visit_date) : null
    };
  }

  async getAllSites(): Promise<Site[]> {
    const dbSites = await this.query<any[]>('SELECT * FROM sites ORDER BY name');
    return dbSites.map(this.mapDbRowToSite);
  }

  async getSite(id: number): Promise<Site | undefined> {
    const dbSites = await this.query<any[]>(
      'SELECT * FROM sites WHERE id = ? LIMIT 1',
      [id]
    );
    return dbSites.length > 0 ? this.mapDbRowToSite(dbSites[0]) : undefined;
  }

   async createSite(site: InsertSite): Promise<Site> {
    const districts = await this.query<any[]>(
        'SELECT id FROM districts WHERE name = ? LIMIT 1',
        [site.district]
    );
    if (districts.length === 0) {
        throw new Error(`District '${site.district}' not found.`);
    }

    const result = await this.query<mysql.ResultSetHeader>(
        `INSERT INTO sites (
            site_id, name, type, district, physical_address, gps_lat, gps_lng,
            host_department, agreement_type, agreement_details, contract_number, contract_term,
            renewal_date, contact_person, contact_email, contact_phone, establishment_date,
            operational_status, assessment_status, total_area, classrooms, offices,
            computer_labs, workshops, has_library, has_student_common_areas, has_staff_facilities,
            accessibility_features, internet_connectivity, security_features,
            building_condition, electrical_condition, plumbing_condition, interior_condition,
            exterior_condition, last_renovation_date, notes, images,
            created_by, last_visited_by, last_visit_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            site.siteId, site.name, site.type, site.district,
            site.physicalAddress ?? null, site.gpsLat ?? null, site.gpsLng ?? null,
            site.hostDepartment ?? null, site.agreementType ?? null, site.agreementDetails ?? null,
            site.contractNumber ?? null, site.contractTerm ?? null, site.renewalDate ?? null,
            site.contactPerson ?? null, site.contactEmail ?? null, site.contactPhone ?? null,
            site.establishmentDate ?? null, site.operationalStatus, site.assessmentStatus,
            site.totalArea ?? null, site.classrooms ?? null, site.offices ?? null,
            site.computerLabs ?? null, site.workshops ?? null, site.hasLibrary ? 1 : 0,
            site.hasStudentCommonAreas ? 1 : 0, site.hasStaffFacilities ? 1 : 0,
            site.accessibilityFeatures ?? null, site.internetConnectivity ?? null, site.securityFeatures ?? null,
            site.buildingCondition ?? null, site.electricalCondition ?? null, site.plumbingCondition ?? null,
            site.interiorCondition ?? null, site.exteriorCondition ?? null, site.lastRenovationDate ?? null,
            site.notes ?? null, site.images && site.images.length > 0 ? JSON.stringify(site.images) : null,
            site.createdBy ?? null, site.lastVisitedBy ?? null, site.lastVisitDate ?? null
        ]
    );
    const newSite = await this.getSite(result.insertId);
    if (!newSite) {
        throw new Error('Failed to fetch created site');
    }
    return newSite;
   }

   async updateSite(id: number, siteUpdate: Partial<Site>): Promise<Site> {
    const existingSite = await this.getSite(id);
    if (!existingSite) {
        throw new Error(`Site with ID ${id} not found`);
    }
    if (siteUpdate.district !== undefined && siteUpdate.district !== existingSite.district) {
        const districts = await this.query<any[]>('SELECT id FROM districts WHERE name = ? LIMIT 1', [siteUpdate.district]);
        if (districts.length === 0) {
            throw new Error(`District '${siteUpdate.district}' not found.`);
        }
    }

    const updates: string[] = [];
    const values: any[] = [];
    const fieldMapping: { [K in keyof Partial<Site>]?: string } = {
        siteId: 'site_id', name: 'name', type: 'type', district: 'district',
        physicalAddress: 'physical_address', gpsLat: 'gps_lat', gpsLng: 'gps_lng',
        hostDepartment: 'host_department', agreementType: 'agreement_type', agreementDetails: 'agreement_details',
        contractNumber: 'contract_number', contractTerm: 'contract_term', renewalDate: 'renewal_date',
        contactPerson: 'contact_person', contactEmail: 'contact_email', contactPhone: 'contact_phone',
        establishmentDate: 'establishment_date', operationalStatus: 'operational_status', assessmentStatus: 'assessment_status',
        totalArea: 'total_area', classrooms: 'classrooms', offices: 'offices',
        computerLabs: 'computer_labs', workshops: 'workshops', hasLibrary: 'has_library',
        hasStudentCommonAreas: 'has_student_common_areas', hasStaffFacilities: 'has_staff_facilities',
        accessibilityFeatures: 'accessibility_features', internetConnectivity: 'internet_connectivity', securityFeatures: 'security_features',
        buildingCondition: 'building_condition', electricalCondition: 'electrical_condition', plumbingCondition: 'plumbing_condition',
        interiorCondition: 'interior_condition', exteriorCondition: 'exterior_condition', lastRenovationDate: 'last_renovation_date',
        notes: 'notes', images: 'images', lastVisitedBy: 'last_visited_by', lastVisitDate: 'last_visit_date'
    };

    for (const key in siteUpdate) {
        if (Object.prototype.hasOwnProperty.call(siteUpdate, key) && fieldMapping[key as keyof Site]) {
            const dbField = fieldMapping[key as keyof Site]!;
            updates.push(`\`${dbField}\` = ?`);
            let value = (siteUpdate as any)[key];
            if (typeof value === 'boolean') value = value ? 1 : 0;
            else if (key === 'images' && Array.isArray(value)) value = value.length > 0 ? JSON.stringify(value) : null;
            values.push(value);
        }
    }
    if (updates.length === 0) return existingSite;
    values.push(id);
    await this.query(`UPDATE sites SET ${updates.join(', ')} WHERE id = ?`, values);
    const updatedSite = await this.getSite(id);
    if (!updatedSite) throw new Error(`Site with ID ${id} not found after update attempt.`);
    return updatedSite;
}

  async deleteSite(id: number): Promise<boolean> {
    const result = await this.query<mysql.ResultSetHeader>(
      'DELETE FROM sites WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
  // --- Staff Methods ---
  private mapDbRowToStaff(dbRow: any): Staff {
    return {
      id: dbRow.id,
      staffId: dbRow.staff_id,
      firstName: dbRow.first_name,
      lastName: dbRow.last_name,
      position: dbRow.position,
      email: dbRow.email,
      phone: dbRow.phone,
      verified: Boolean(dbRow.verified),
      qualifications: dbRow.qualifications ? JSON.parse(dbRow.qualifications) : [],
      skills: dbRow.skills ? JSON.parse(dbRow.skills) : [],
      workload: dbRow.workload,
      notes: dbRow.notes || null,
      department: dbRow.department || null,
      startDate: dbRow.start_date || null,
      contractEndDate: dbRow.contract_end_date || null,
      employmentStatus: dbRow.employment_status || null,
      siteId: dbRow.site_id
    };
   }

  async getAllStaff(): Promise<Staff[]> {
    const staffMembers = await this.query<any[]>('SELECT * FROM staff ORDER BY last_name, first_name');
    return staffMembers.map(this.mapDbRowToStaff);
  }

  async getStaff(id: number): Promise<Staff | undefined> {
    const staffMembers = await this.query<any[]>(
      'SELECT * FROM staff WHERE id = ? LIMIT 1',
      [id]
    );
    return staffMembers.length > 0 ? this.mapDbRowToStaff(staffMembers[0]) : undefined;
  }

  async getStaffBySite(siteId: number): Promise<Staff[]> {
    const staffMembers = await this.query<any[]>(
      'SELECT * FROM staff WHERE site_id = ? ORDER BY last_name, first_name',
      [siteId] // Assuming staff.site_id links to sites.id (numeric PK)
    );
    return staffMembers.map(this.mapDbRowToStaff);
  }

  async createStaff(staff: InsertStaff): Promise<Staff> {
      if (staff.siteId) {
          const siteExists = await this.getSite(staff.siteId); // Use numeric siteId
          if (!siteExists) {
              throw new Error(`Site with ID ${staff.siteId} not found.`);
          }
      }
      const result = await this.query<mysql.ResultSetHeader>(
      `INSERT INTO staff (
        staff_id, first_name, last_name, position, email, phone,
        verified, qualifications, skills, workload, site_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        staff.staffId, staff.firstName, staff.lastName,
        staff.position ?? null, staff.email ?? null, staff.phone ?? null,
        staff.verified ? 1 : 0,
        staff.qualifications && staff.qualifications.length > 0 ? JSON.stringify(staff.qualifications) : null,
        staff.skills && staff.skills.length > 0 ? JSON.stringify(staff.skills) : null,
        staff.workload ?? null, staff.siteId ?? null
      ]
    );
    const newStaff = await this.getStaff(result.insertId);
    if (!newStaff) throw new Error('Failed to fetch created staff member');
    return newStaff;
  }

   async updateStaff(id: number, staffUpdate: Partial<InsertStaff>): Promise<Staff> {
        const existingStaff = await this.getStaff(id);
        if (!existingStaff) throw new Error(`Staff member with ID ${id} not found`);

        if (staffUpdate.siteId !== undefined && staffUpdate.siteId !== null) {
            const siteExists = await this.getSite(staffUpdate.siteId);
            if (!siteExists) throw new Error(`Site with ID ${staffUpdate.siteId} not found.`);
        }

        const updates: string[] = [];
        const values: any[] = [];
        const fieldMapping: { [K in keyof Partial<InsertStaff>]?: string } = {
            staffId: 'staff_id', firstName: 'first_name', lastName: 'last_name',
            position: 'position', email: 'email', phone: 'phone',
            verified: 'verified', qualifications: 'qualifications', skills: 'skills',
            workload: 'workload', siteId: 'site_id'
        };

        for (const key in staffUpdate) {
            if (Object.prototype.hasOwnProperty.call(staffUpdate, key) && fieldMapping[key as keyof InsertStaff]) {
                const dbField = fieldMapping[key as keyof InsertStaff]!;
                updates.push(`\`${dbField}\` = ?`);
                let value = (staffUpdate as any)[key];
                if (typeof value === 'boolean') value = value ? 1 : 0;
                else if (Array.isArray(value) && (key === 'qualifications' || key === 'skills')) {
                    value = value.length > 0 ? JSON.stringify(value) : null;
                }
                values.push(value);
            }
        }
        if (updates.length === 0) return existingStaff;
        values.push(id);
        await this.query(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`, values);
        const updatedStaff = await this.getStaff(id);
        if (!updatedStaff) throw new Error(`Staff member with ID ${id} not found after update`);
        return updatedStaff;
   }

  async deleteStaff(id: number): Promise<boolean> {
    const result = await this.query<mysql.ResultSetHeader>(
      'DELETE FROM staff WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  // --- Asset Methods ---
   private mapDbRowToAsset(dbRow: any): Asset {
        return {
            id: dbRow.id,
            assetId: dbRow.asset_id,
            name: dbRow.name,
            type: dbRow.type,
            category: dbRow.category,
            manufacturer: dbRow.manufacturer,            model: dbRow.model,
            serialNumbers: dbRow.serial_numbers ? JSON.parse(dbRow.serial_numbers) : [],
            purchaseDate: dbRow.purchase_date || null,
            purchasePrice: dbRow.purchase_price ? String(dbRow.purchase_price) : null,
            location: dbRow.location,
            assignedTo: dbRow.assigned_to,
            lastMaintenanceDate: dbRow.last_maintenance_date || null,
            nextMaintenanceDate: dbRow.next_maintenance_date || null,
            description: dbRow.description,
            condition: dbRow.condition,
            acquisitionDate: dbRow.acquisition_date || null,
            lastServiceDate: dbRow.last_service_date || null,
            notes: dbRow.notes,
            images: dbRow.images ? JSON.parse(dbRow.images) : [],
            siteId: dbRow.site_id
        };
    }

  async getAllAssets(): Promise<Asset[]> {
    const assets = await this.query<any[]>('SELECT * FROM assets ORDER BY name');
    return assets.map(this.mapDbRowToAsset);
  }

  async getAsset(id: number): Promise<Asset | undefined> {
    const assets = await this.query<any[]>(
      'SELECT * FROM assets WHERE id = ? LIMIT 1',
      [id]
    );
    return assets.length > 0 ? this.mapDbRowToAsset(assets[0]) : undefined;
  }

  async getAssetsBySite(siteId: number): Promise<Asset[]> {
    const assets = await this.query<any[]>(
      'SELECT * FROM assets WHERE site_id = ? ORDER BY name',
      [siteId] // Assuming assets.site_id links to sites.id
    );
    return assets.map(this.mapDbRowToAsset);
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
        if (asset.siteId) { // Use numeric siteId
            const siteExists = await this.getSite(asset.siteId);
            if (!siteExists) {
                throw new Error(`Site with ID ${asset.siteId} not found.`);
            }
        }
        const result = await this.query<mysql.ResultSetHeader>(        `INSERT INTO assets (
            asset_id, name, type, category, manufacturer, model, serial_numbers,
            purchase_date, purchase_price, location, assigned_to, last_maintenance_date,
            next_maintenance_date, description, \`condition\`, acquisition_date, last_service_date,
            notes, images, site_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            asset.assetId, asset.name, asset.type ?? null, asset.category,
            asset.manufacturer ?? null, asset.model ?? null,
            asset.serialNumbers && asset.serialNumbers.length > 0 ? JSON.stringify(asset.serialNumbers) : JSON.stringify([]),
            asset.purchaseDate ?? null, asset.purchasePrice ?? null, asset.location ?? null,
            asset.assignedTo ?? null, asset.lastMaintenanceDate ?? null, asset.nextMaintenanceDate ?? null,
            asset.description ?? null, asset.condition, asset.acquisitionDate ?? null,
            asset.lastServiceDate ?? null, asset.notes ?? null,
            asset.images && asset.images.length > 0 ? JSON.stringify(asset.images) : null,
            asset.siteId ?? null
        ]
        );
    const newAsset = await this.getAsset(result.insertId);
    if (!newAsset) throw new Error('Failed to fetch created asset');
    return newAsset;
  }

   async updateAsset(id: number, assetUpdate: Partial<InsertAsset>): Promise<Asset> {
        const existingAsset = await this.getAsset(id);
        if (!existingAsset) throw new Error(`Asset with ID ${id} not found`);
        if (assetUpdate.siteId !== undefined && assetUpdate.siteId !== null) {
            const siteExists = await this.getSite(assetUpdate.siteId);
            if (!siteExists) throw new Error(`Site with ID ${assetUpdate.siteId} not found.`);
        }

        const updates: string[] = [];
        const values: any[] = [];        const fieldMapping: { [K in keyof Partial<InsertAsset>]?: string } = {
            assetId: 'asset_id', name: 'name', type: 'type', category: 'category',
            manufacturer: 'manufacturer', model: 'model', serialNumbers: 'serial_numbers',
            purchaseDate: 'purchase_date', purchasePrice: 'purchase_price', location: 'location',
            assignedTo: 'assigned_to', lastMaintenanceDate: 'last_maintenance_date',
            nextMaintenanceDate: 'next_maintenance_date', description: 'description',
            condition: 'condition', acquisitionDate: 'acquisition_date', lastServiceDate: 'last_service_date',
            notes: 'notes', images: 'images', siteId: 'site_id'
        };

        for (const key in assetUpdate) {
            if (Object.prototype.hasOwnProperty.call(assetUpdate, key) && fieldMapping[key as keyof InsertAsset]) {
                const dbField = fieldMapping[key as keyof InsertAsset]!;
                updates.push(`\`${dbField}\` = ?`);
                let value = (assetUpdate as any)[key];                if ((key === 'images' || key === 'serialNumbers') && Array.isArray(value)) {
                    value = value.length > 0 ? JSON.stringify(value) : (key === 'serialNumbers' ? '[]' : null);
                }
                values.push(value);
            }
        }
        if (updates.length === 0) return existingAsset;
        values.push(id);
        await this.query(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`, values);
        const updatedAsset = await this.getAsset(id);
        if (!updatedAsset) throw new Error(`Asset with ID ${id} not found after update`);
        return updatedAsset;
   }

  async deleteAsset(id: number): Promise<boolean> {
    const result = await this.query<mysql.ResultSetHeader>(
      'DELETE FROM assets WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  // --- Program Methods ---
    private mapDbRowToProgram(dbRow: any): Program {
        return {
            id: dbRow.id,
            programId: dbRow.program_id,
            name: dbRow.name,
            category: dbRow.category,
            description: dbRow.description,
            enrollmentCount: dbRow.enrollment_count ? parseInt(dbRow.enrollment_count, 10) : null,
            startDate: dbRow.start_date || null,
            endDate: dbRow.end_date || null,
            status: dbRow.status,
            notes: dbRow.notes,
            siteId: dbRow.site_id
        };
    }

  async getAllPrograms(): Promise<Program[]> {
    const programs = await this.query<any[]>('SELECT * FROM programs ORDER BY name');
    return programs.map(this.mapDbRowToProgram);
  }

  async getProgram(id: number): Promise<Program | undefined> {
    const programs = await this.query<any[]>(
      'SELECT * FROM programs WHERE id = ? LIMIT 1',
      [id]
    );
    return programs.length > 0 ? this.mapDbRowToProgram(programs[0]) : undefined;
  }

  async getProgramsBySite(siteId: number): Promise<Program[]> {
    const programs = await this.query<any[]>(
      'SELECT * FROM programs WHERE site_id = ? ORDER BY name',
      [siteId] // Assuming programs.site_id links to sites.id
    );
    return programs.map(this.mapDbRowToProgram);
  }

  async createProgram(program: InsertProgram): Promise<Program> {
    if (program.siteId) { // Use numeric siteId
        const siteExists = await this.getSite(program.siteId);
        if (!siteExists) {
            throw new Error(`Site with ID ${program.siteId} not found.`);
        }
    }
    const result = await this.query<mysql.ResultSetHeader>(
      `INSERT INTO programs (
        program_id, name, category, description, enrollment_count,
        start_date, end_date, status, notes, site_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        program.programId, program.name, program.category,
        program.description ?? null, program.enrollmentCount ?? null,
        program.startDate ?? null, program.endDate ?? null, program.status,
        program.notes ?? null, program.siteId ?? null
      ]
    );
    const newProgram = await this.getProgram(result.insertId);
    if (!newProgram) throw new Error('Failed to fetch created program');
    return newProgram;
  }

   async updateProgram(id: number, programUpdate: Partial<InsertProgram>): Promise<Program> {
        const existingProgram = await this.getProgram(id);
        if (!existingProgram) throw new Error(`Program with ID ${id} not found`);
        if (programUpdate.siteId !== undefined && programUpdate.siteId !== null) {
            const siteExists = await this.getSite(programUpdate.siteId);
            if (!siteExists) throw new Error(`Site with ID ${programUpdate.siteId} not found.`);
        }

        const updates: string[] = [];
        const values: any[] = [];
        const fieldMapping: { [K in keyof Partial<InsertProgram>]?: string } = {
            programId: 'program_id', name: 'name', category: 'category', description: 'description',
            enrollmentCount: 'enrollment_count', startDate: 'start_date', endDate: 'end_date',
            status: 'status', notes: 'notes', siteId: 'site_id'
        };

        for (const key in programUpdate) {
            if (Object.prototype.hasOwnProperty.call(programUpdate, key) && fieldMapping[key as keyof InsertProgram]) {
                const dbField = fieldMapping[key as keyof InsertProgram]!;
                updates.push(`\`${dbField}\` = ?`);
                values.push((programUpdate as any)[key]);
            }
        }
        if (updates.length === 0) return existingProgram;
        values.push(id);
        await this.query(`UPDATE programs SET ${updates.join(', ')} WHERE id = ?`, values);
        const updatedProgram = await this.getProgram(id);
        if (!updatedProgram) throw new Error(`Program with ID ${id} not found after update`);
        return updatedProgram;
   }

  async deleteProgram(id: number): Promise<boolean> {
    const result = await this.query<mysql.ResultSetHeader>(
      'DELETE FROM programs WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  // --- Activity Methods ---
    private mapDbRowToActivity(dbRow: any): Activity {
        return {
            id: dbRow.id,
            type: dbRow.type,
            description: dbRow.description,
            relatedEntityId: dbRow.related_entity_id,
            relatedEntityType: dbRow.related_entity_type,
            performedBy: dbRow.performed_by,
            timestamp: dbRow.timestamp ? new Date(dbRow.timestamp) : new Date(),
            metadata: dbRow.metadata ? JSON.parse(dbRow.metadata) : {}
        };
    }

  async getAllActivities(): Promise<Activity[]> {
    const activities = await this.query<any[]>('SELECT * FROM activities ORDER BY timestamp DESC');
    return activities.map(this.mapDbRowToActivity);
  }

  async getActivity(id: number): Promise<Activity | undefined> {
    const activities = await this.query<any[]>(
      'SELECT * FROM activities WHERE id = ? LIMIT 1',
      [id]
    );
    return activities.length > 0 ? this.mapDbRowToActivity(activities[0]) : undefined;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
        const result = await this.query<mysql.ResultSetHeader>(
        `INSERT INTO activities (
            type, description, related_entity_id, related_entity_type,
            performed_by, metadata, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
            activity.type, activity.description,
            activity.relatedEntityId ?? null, activity.relatedEntityType ?? null,
            activity.performedBy ?? null,
            activity.metadata ? JSON.stringify(activity.metadata) : null
        ]
        );
    const newActivity = await this.getActivity(result.insertId);
    if (!newActivity) throw new Error('Failed to fetch created activity');
    return newActivity;
  }

   async updateActivity(id: number, activityUpdate: Partial<Activity>): Promise<Activity> {
        const existingActivity = await this.getActivity(id);
        if (!existingActivity) throw new Error(`Activity with ID ${id} not found`);

        const updates: string[] = [];
        const values: any[] = [];
        const fieldMapping: { [K in keyof Partial<Activity>]?: string } = {
            type: 'type', description: 'description', relatedEntityId: 'related_entity_id',
            relatedEntityType: 'related_entity_type', performedBy: 'performed_by',
            metadata: 'metadata'
        };

        for (const key in activityUpdate) {
             if (Object.prototype.hasOwnProperty.call(activityUpdate, key) && fieldMapping[key as keyof Activity]) {
                const dbField = fieldMapping[key as keyof Activity]!;
                updates.push(`\`${dbField}\` = ?`);
                let value = (activityUpdate as any)[key];
                if (key === 'metadata' && typeof value === 'object') {
                    value = JSON.stringify(value);
                }
                values.push(value);
            }
        }
        if (updates.length === 0) return existingActivity;
        values.push(id);
        await this.query(`UPDATE activities SET ${updates.join(', ')} WHERE id = ?`, values);
        const updatedActivity = await this.getActivity(id);
        if (!updatedActivity) throw new Error(`Activity with ID ${id} not found after update`);
        return updatedActivity;
   }

  async deleteActivity(id: number): Promise<boolean> {
    const result = await this.query<mysql.ResultSetHeader>(
      'DELETE FROM activities WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}